import { test, expect, type Page } from '@playwright/test';
import { NATIVE_SESSION, nativeOrigin, signIn } from '../support/sign-in.js';
import {
  nativeDataDirectory,
  continueNativeSessionIfNeeded,
  openNativeSessionRow,
  writeNativeTerminalTranscript,
} from '../support/native-fixture.js';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Control } from '../../apps/control/src/control.js';
import type { Session } from '../../apps/control/src/services/terminals/terminal-session.js';
import { command } from '../../tests/aether/fixture.js';

// Synthetic CLI only; each attempt must release its own terminal capacity.
let fixtureControl: Control | undefined;
let priorTerminals = new Set<string>();
test.beforeAll(() => {
  const directory = nativeDataDirectory();
  expect(basename(directory)).toMatch(/^aether-synthetic-browser-/);
  fixtureControl = new Control(join(directory, 'control.sqlite'), { mode: 'live' });
  priorTerminals = new Set(
    fixtureControl.ctx.sqlite.prepare('SELECT id FROM terminal_sessions').pluck().all() as string[],
  );
});
test.afterAll(() => fixtureControl?.close());
test.afterEach(async () => {
  const control = fixtureControl;
  if (!control) return;
  const db = control.ctx.sqlite;
  const spawned = () =>
    (db.prepare("SELECT * FROM terminal_sessions WHERE state<>'exited'").all() as Session[]).filter(
      ({ id }) => !priorTerminals.has(id),
    );
  const owner = control.authenticate(
    readFileSync(join(dirname(control.ctx.sqlite.name), 'owner-token'), 'utf8').trim(),
  );
  db.transaction(() => {
    for (const row of spawned().filter(({ state }) => state !== 'stopping'))
      control.execute(
        owner,
        command('terminal.stop', { terminalId: row.id, epoch: row.controlEpoch }, row.projectId),
      );
  }).immediate();
  await expect.poll(() => spawned().length, { timeout: 20000 }).toBe(0);
});

async function login(page: Page) {
  await signIn(page, nativeOrigin(), { session: NATIVE_SESSION });
  await expect(page.getByRole('link', { name: '辦公室', exact: true }).first()).toBeVisible();
}

async function expectAccessible(page: Page) {
  // A menu that is still fading in has a blended colour: axe would measure the contrast of that, not of the finished page.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    const { violations } = await new AxeBuilder({ page })
      .include('.session-panel')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(violations, theme).toEqual([]);
  }
  await page.evaluate(() => (document.documentElement.dataset['theme'] = 'dark'));
}

async function openSession(page: Page, view: 'observed' | 'desktop' | 'phone' = 'observed') {
  const sessionId = writeNativeTerminalTranscript({ answerText: 'Earlier answer from a terminal' });
  const scope = await openNativeSessionRow(page, sessionId, view === 'phone');
  if (view !== 'observed') await continueNativeSessionIfNeeded(scope);
  return { scope, conversation: scope.locator('.conversation') };
}

test('external sessions stay read-only until continued in AETHER', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  const { conversation } = await openSession(page);
  const message = (value: string) => conversation.getByText(value);
  await expect(message('Earlier answer from a terminal')).toBeVisible({ timeout: 15000 });
  const footer = conversation.locator('.session-footer');
  const send = conversation.getByRole('button', { name: '送出', exact: true });
  await expect(footer).toContainText('唯讀');
  await expect(conversation.locator('textarea')).toHaveCount(0);
  await footer.getByRole('button', { name: '在 AETHER 繼續', exact: true }).click();
  await expect(footer.getByText(/終端機已啟動/)).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-continue.png' });
  const box = conversation.getByLabel('傳訊息給 session');
  await expect(box).toBeVisible({ timeout: 45000 });
  await expect(footer).not.toContainText('唯讀');
  await expectAccessible(page);

  await box.fill('hello from the composer');
  await box.press('Enter');
  await expect(conversation.locator('.msg.user.pending')).toContainText('hello from the composer');
  await expect(message('ECHO: hello from the composer')).toBeVisible({ timeout: 30000 });
  await expect(conversation.locator('.msg.user.pending')).toHaveCount(0);
  await expect(
    conversation.locator('.msg.user', { hasText: 'hello from the composer' }),
  ).toHaveCount(1);

  await box.fill('first line');
  await box.press('Shift+Enter');
  await box.pressSequentially('second line');
  await box.press('Enter');
  await expect(message('ECHO: first line / second line')).toBeVisible({ timeout: 30000 });

  await box.fill('slow task please');
  await box.press('Enter');
  await expect(
    conversation.locator('.msg.user:not(.pending)', { hasText: 'slow task please' }),
  ).toBeVisible({ timeout: 45000 });
  const stop = conversation.getByRole('button', { name: '停止', exact: true });
  await expect(stop).toBeVisible({ timeout: 30000 });
  await expect(send).toHaveCount(0);
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-working.png' });
  await stop.click();
  await expect(message('[interrupted]')).toBeVisible({ timeout: 30000 });
  await expect(send).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});

test('slash and @file menus complete input and list custom commands', async ({ page }) => {
  await login(page);
  const { conversation } = await openSession(page, 'desktop');
  const box = conversation.getByLabel('傳訊息給 session');
  await box.fill('/co');
  const menu = conversation.getByRole('listbox', { name: '指令' });
  await expect(menu.getByRole('option', { name: /\/compact/ })).toBeVisible();
  await expect(menu.getByRole('option', { name: /\/compact/ })).not.toContainText('終端機中');
  await box.fill('/mod');
  await expect(menu.getByRole('option', { name: /\/model/ })).toContainText('會在終端機中開啟清單');
  await expectAccessible(page);
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-slash.png' });
  await box.press('Tab');
  await expect(box).toHaveValue('/model ');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(true))));
  await box.fill('look at @fixt');
  const files = conversation.getByRole('listbox', { name: '檔案' });
  await expect(files.getByRole('option', { name: 'fixture.txt' })).toBeVisible();
  await box.press('Enter');
  await expect(box).toHaveValue('look at @fixture.txt ');
  await box.fill('');
});

test('offline messages queue and send when the connection returns', async ({ page, context }) => {
  await login(page);
  const { conversation } = await openSession(page, 'desktop');
  const box = conversation.getByLabel('傳訊息給 session');
  await context.setOffline(true);
  await box.fill('sent while offline');
  await box.press('Enter');
  const bubble = conversation.locator('.msg.user.pending', { hasText: 'sent while offline' });
  await expect(bubble).toContainText('等待送出');
  await expect(conversation.getByText(/目前離線/)).toBeVisible();
  await context.setOffline(false);
  await expect(conversation.getByText('ECHO: sent while offline')).toBeVisible({ timeout: 45000 });
  await expect(conversation.locator('.msg.user.pending')).toHaveCount(0);
});

test('phone: Enter adds a line; quick replies use buttons', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await login(page);
  const { scope } = await openSession(page, 'phone');
  const box = scope.getByLabel('傳訊息給 session');
  await box.tap();
  await box.pressSequentially('one');
  await box.press('Enter');
  await box.pressSequentially('two');
  await expect(box).toHaveValue('one\ntwo');
  await expect(scope.locator('.msg.user.pending')).toHaveCount(0);
  const quick = scope.getByRole('toolbar', { name: '快速回覆' });
  await expect(quick.getByRole('button')).toHaveText(['繼續', '是', '否', 'Esc']);
  for (const control of await scope.locator('.composer button, .composer textarea').all()) {
    const size = await control.boundingBox();
    if (size) expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(32);
  }
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-phone.png' });
  await box.fill('');
  await quick.getByRole('button', { name: '繼續', exact: true }).tap();
  await expect(scope.getByText('ECHO: continue')).toBeVisible({ timeout: 30000 });
  await context.close();
});
