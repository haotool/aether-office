import { test, expect, type Page } from '@playwright/test';
import { NATIVE_SESSION, nativeOrigin, signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

// The composer, against a FAKE interactive CLI (fixtures/processes/claude-tui.mjs, started by
// scripts/e2e-native-server.ts) and never a model. The server has one terminal-started session to resume; everything
// after "Continue in AETHER" is the fake CLI running in an AETHER terminal.

async function login(page: Page) {
  await signIn(page, nativeOrigin(), { session: NATIVE_SESSION });
  // Signed in means the navigation is there: the login page has a `main` too, and a page change while the sign-in is still
  // answering would lose its CSRF token (the next send would be refused).
  await expect(page.getByRole('link', { name: '辦公室', exact: true }).first()).toBeVisible();
}

/** The panel, composer included, passes axe (contrast too) in the dark theme and the light one. */
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

async function openObserved(page: Page) {
  const projects = (await (await page.request.get(`${nativeOrigin()}/api/projects`)).json()) as {
    id: string;
    name: string;
  }[];
  const project = projects.find((p) => p.name.startsWith('Synthetic browser fixture'))!;
  await page.goto(`${nativeOrigin()}/office?project=${project.id}`);
  const panel = page.locator('.session-panel');
  const row = panel.locator('.feed-row').first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.click();
  return panel.locator('.conversation');
}

test('a session AETHER does not own is read-only; continuing it in AETHER makes it drivable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  const conversation = await openObserved(page);
  await expect(conversation.getByText('Earlier answer from a terminal')).toBeVisible({
    timeout: 15000,
  });
  // Honest: no text box, an explanation, and the way to continue where AETHER can drive.
  const footer = conversation.locator('.session-footer');
  await expect(footer).toContainText('唯讀');
  await expect(conversation.locator('textarea')).toHaveCount(0);
  await footer.getByRole('button', { name: '在 AETHER 繼續', exact: true }).click();
  await expect(footer.getByText(/終端機已啟動/)).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-continue.png' });
  // The fake CLI resumes the same session in an AETHER terminal: now the footer is a composer.
  const box = conversation.getByLabel('傳訊息給 session');
  await expect(box).toBeVisible({ timeout: 45000 });
  await expect(conversation.locator('.session-footer')).not.toContainText('唯讀');
  await expectAccessible(page);

  // Send: the message shows at once as a pending bubble, then the transcript's own bubble replaces it (once).
  await box.fill('hello from the composer');
  await box.press('Enter');
  await expect(conversation.locator('.msg.user.pending')).toContainText('hello from the composer');
  await expect(conversation.getByText('ECHO: hello from the composer')).toBeVisible({
    timeout: 30000,
  });
  await expect(conversation.locator('.msg.user.pending')).toHaveCount(0);
  await expect(
    conversation.locator('.msg.user', { hasText: 'hello from the composer' }),
  ).toHaveCount(1);

  // Several lines go in as one message; Shift+Enter is a new line, not a send.
  await box.fill('first line');
  await box.press('Shift+Enter');
  await box.pressSequentially('second line');
  await box.press('Enter');
  await expect(conversation.getByText('ECHO: first line / second line')).toBeVisible({
    timeout: 30000,
  });

  // While it works Stop takes the place of Send; it interrupts, and Send comes back.
  // (A message sent while the session is still finishing the last one waits for it; Stop is for the one it is doing.)
  await box.fill('slow task please');
  await box.press('Enter');
  await expect(
    conversation.locator('.msg.user:not(.pending)', { hasText: 'slow task please' }),
  ).toBeVisible({ timeout: 45000 });
  const stop = conversation.getByRole('button', { name: '停止', exact: true });
  await expect(stop).toBeVisible({ timeout: 30000 });
  await expect(conversation.getByRole('button', { name: '送出', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-working.png' });
  await stop.click();
  await expect(conversation.getByText('[interrupted]')).toBeVisible({ timeout: 30000 });
  await expect(conversation.getByRole('button', { name: '送出', exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(errors).toEqual([]);
});

test('the slash menu and @file completion fill the box; custom commands are listed', async ({
  page,
}) => {
  await login(page);
  const conversation = await openObserved(page);
  const box = conversation.getByLabel('傳訊息給 session');
  await expect(box).toBeVisible({ timeout: 45000 });
  await box.fill('/co');
  const menu = conversation.getByRole('listbox', { name: '指令' });
  await expect(menu.getByRole('option', { name: /\/compact/ })).toBeVisible();
  await expect(menu.getByRole('option', { name: /\/compact/ })).not.toContainText('終端機中');
  // A command that opens a list in the terminal says so.
  await box.fill('/mod');
  await expect(menu.getByRole('option', { name: /\/model/ })).toContainText('會在終端機中開啟清單');
  await expectAccessible(page); // with the list open
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-slash.png' });
  await box.press('Tab');
  await expect(box).toHaveValue('/model ');
  // The caret is put after the completion on the next frame; let it land before the box is typed into again.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(true))));
  await box.fill('look at @fixt');
  const files = conversation.getByRole('listbox', { name: '檔案' });
  await expect(files.getByRole('option', { name: 'fixture.txt' })).toBeVisible();
  await box.press('Enter');
  await expect(box).toHaveValue('look at @fixture.txt ');
  await box.fill('');
});

test('offline: a message waits in the conversation and goes in when the connection returns', async ({
  page,
  context,
}) => {
  await login(page);
  const conversation = await openObserved(page);
  const box = conversation.getByLabel('傳訊息給 session');
  await expect(box).toBeVisible({ timeout: 45000 });
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

test('phone: Enter is a new line, Send is a button, quick replies are one tap', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await login(page);
  const projects = (await (await page.request.get(`${nativeOrigin()}/api/projects`)).json()) as {
    id: string;
    name: string;
  }[];
  const project = projects.find((p) => p.name.startsWith('Synthetic browser fixture'))!;
  await page.goto(`${nativeOrigin()}/office?project=${project.id}`);
  await page.getByRole('button', { name: '開啟 session 列表' }).tap();
  await page.locator('.session-sheet.half .feed-row').first().tap();
  const full = page.locator('.session-sheet.full');
  const box = full.getByLabel('傳訊息給 session');
  await expect(box).toBeVisible({ timeout: 45000 });
  await box.tap();
  await box.pressSequentially('one');
  await box.press('Enter');
  await box.pressSequentially('two');
  await expect(box).toHaveValue('one\ntwo');
  await expect(full.locator('.msg.user.pending')).toHaveCount(0); // Enter did not send
  const quick = full.getByRole('toolbar', { name: '快速回覆' });
  await expect(quick.getByRole('button')).toHaveText(['繼續', '是', '否', 'Esc']);
  for (const control of await full.locator('.composer button, .composer textarea').all()) {
    const size = await control.boundingBox();
    if (size) expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(32);
  }
  await page.screenshot({ path: 'evidence/screenshots/e2e-composer-phone.png' });
  await box.fill('');
  await quick.getByRole('button', { name: '繼續', exact: true }).tap();
  await expect(full.getByText('ECHO: continue')).toBeVisible({ timeout: 30000 });
  await context.close();
});
