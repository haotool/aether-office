import { test, expect, type Page } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

// The session panel: a feed of sessions, then the chosen session's conversation. The fixture session is the one
// playwright.config.ts writes (e2e-session); its transcript is given a conversation here.
const transcript = join(
  process.env['AETHER_LOCAL_SESSIONS_HOME']!,
  '.claude/projects/p/e2e-session.jsonl',
);
const entry = (message: unknown) =>
  JSON.stringify({ timestamp: new Date().toISOString(), ...(message as object) }) + '\n';
const said = (text: string) =>
  entry({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const call = (id: string, name: string, input: unknown) =>
  entry({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  }) +
  entry({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
  });

test.beforeAll(() => {
  appendFileSync(
    transcript,
    entry({ type: 'user', message: { role: 'user', content: 'Add retries to the upload' } }) +
      said('I will add **retries** with a `backoff`.') +
      call('t1', 'Read', { file_path: '/repo/src/upload.ts' }) +
      call('t2', 'Read', { file_path: '/repo/src/retry.ts' }) +
      call('t3', 'Edit', { file_path: '/repo/src/upload.ts' }) +
      Array.from({ length: 24 }, (_, i) => said(`Progress note ${i + 1}: still going.`)).join('') +
      said('Done: retries added.'),
  );
});

async function login(page: Page) {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  // The fixture repository is adopted as its own project, where its session lives.
  const option = page.locator('.project-picker select option', { hasText: 'fixture-repo' });
  await expect(option).toBeAttached({ timeout: 15000 });
  const projects = (await (await page.request.get('/api/projects')).json()) as {
    id: string;
    name: string;
  }[];
  return projects.find((p) => p.name === 'fixture-repo')!.id;
}

/** The panel passes axe (contrast included) in the dark theme and the light one. */
async function expectAccessible(page: Page) {
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

test('desktop: a feed row opens the conversation, which follows the newest message and folds the rest', async ({
  page,
}) => {
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  const panel = page.locator('.session-panel');
  await expect(panel.getByRole('heading', { name: '即時 session' })).toBeVisible();
  const row = panel.locator('.feed-row', { hasText: 'fixture-repo' });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expectAccessible(page);
  await page.screenshot({ path: 'evidence/screenshots/e2e-session-feed.png' });

  await row.click();
  await expect(page).toHaveURL(/agent=local%3Aclaude%3Ae2e-session/);
  const conversation = panel.locator('.conversation');
  // The transcript comes first, newest at the bottom; the details are one closed fold at its end.
  await expect(conversation.getByText('Add retries to the upload')).toBeVisible({ timeout: 10000 });
  const scroll = conversation.locator('.conv-scroll');
  await expect(conversation.getByText('Done: retries added.')).toBeVisible();
  await expect(
    conversation.locator('.tool-summary', { hasText: '讀取 2 次 · 編輯 1 次' }),
  ).toBeVisible();
  await expect(conversation.locator('.session-details')).not.toHaveAttribute('open', '');
  // An honest footer, not a composer: nothing here can type into the terminal that started the session.
  await expect(conversation.locator('.session-footer')).toContainText('唯讀');
  await expect(conversation.locator('textarea, input[type=text]')).toHaveCount(0);
  await conversation.locator('.tool-summary').first().click();
  await expect(conversation.locator('.tool-rows').first()).toContainText('Read');
  await conversation.locator('.session-details summary').click();
  await expect(conversation.getByText('uncommitted', { exact: true })).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: 'evidence/screenshots/e2e-session-conversation.png' });

  // Scrolled up to read: a new message does not move the view, it adds a pill that takes you down.
  await scroll.evaluate((el) => (el.scrollTop = 0));
  appendFileSync(transcript, said('A new reply that arrived while you were reading.'));
  const pill = conversation.locator('.new-pill');
  await expect(pill).toBeVisible({ timeout: 15000 });
  expect(await scroll.evaluate((el) => el.scrollTop)).toBeLessThan(40);
  await pill.click();
  await expect(
    conversation.getByText('A new reply that arrived while you were reading.'),
  ).toBeVisible();
  await expect(pill).toHaveCount(0);
  // The selection stayed where the person put it through all of that.
  await expect(page).toHaveURL(/agent=local%3Aclaude%3Ae2e-session/);

  await conversation.getByRole('button', { name: '全部 session' }).click();
  await expect(panel.locator('.panel-feed')).toBeVisible();
  await expect(page).not.toHaveURL(/agent=/);
});

test('phone: the sheet peeks, opens to the feed, then to the conversation, and goes back', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const projectId = await login(page);
  await page.goto(`/office?project=${projectId}`);
  // Peek: 72px, session chips and the newest reply line, above the tab bar.
  const peek = page.locator('.member-bar.feed-peek');
  await expect(peek).toBeVisible({ timeout: 15000 });
  const box = (await peek.boundingBox())!;
  expect(Math.round(box.height)).toBe(72);
  expect(box.y + box.height).toBeLessThanOrEqual((await page.locator('.tabbar').boundingBox())!.y);
  await expect(peek.locator('.sheet-chip').first()).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-sheet-peek.png' });

  await peek.getByRole('button', { name: '開啟 session 列表' }).tap();
  const half = page.locator('.session-sheet.half');
  await expect(half.locator('.feed-row', { hasText: 'fixture-repo' })).toBeVisible();
  await page.screenshot({ path: 'evidence/screenshots/e2e-sheet-half.png' });

  await half.locator('.feed-row', { hasText: 'fixture-repo' }).tap();
  const full = page.locator('.session-sheet.full');
  await expect(full.getByText('Add retries to the upload')).toBeVisible({ timeout: 10000 });
  await expect(page).toHaveURL(/agent=local%3Aclaude%3Ae2e-session/);
  // Every control in the sheet can be hit with a finger.
  for (const control of await full.locator('button, summary').all()) {
    const size = await control.boundingBox();
    if (size) expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(36);
  }
  await page.screenshot({ path: 'evidence/screenshots/e2e-sheet-full.png' });

  // Collapsing keeps the member in hand: the bar shows who (and their newest reply line, for a running session).
  await full.getByRole('button', { name: '收合', exact: true }).tap();
  const bar = page.locator('.member-bar:not(.feed-peek)');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('fixture-repo');
  await bar.getByRole('button', { name: '開啟對話' }).tap();
  await expect(page.locator('.session-sheet.full')).toBeVisible();

  await page.locator('.session-sheet.full').getByRole('button', { name: '全部 session' }).tap();
  await expect(page.locator('.session-sheet.half .panel-feed')).toBeVisible();
  await expect(page).not.toHaveURL(/agent=/);
  await context.close();
});
