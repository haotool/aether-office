import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enter, home } from '../support/seats.js';

// A synthetic Claude transcript with the wrappers a real session leaves in its text, next to generics in prose and
// code: the DOM must never show a raw wrapper tag outside code. No process and no model: the transcripts are files in
// the fixture home.
const REPO = 'fixture-conv';
const ID = 'dddddddd-0000-4000-8000-000000000001';
const repo = join(realpathSync(home), REPO);
const folder = join(home, '.claude/projects/conv');
let claude: ChildProcess | undefined;

const TASK = (status: string, summary: string) =>
  `<task-notification>\n<task-id>b3k9x2</task-id>\n<tool-use-id>toolu_01ABCdef</tool-use-id>\n<output-file>/tmp/tasks/b3k9x2.output</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`;
const REPLY = [
  'The build is **green**. Types stay text: `Array<string>`, Map<K, V>, std::vector<int> and Promise<void>.',
  '',
  'A stray closer </div> and </summary> must not show. Search target: needle one.',
  '',
  '```tsx',
  'const a = <Button onClick={f}>go</Button>; // </task-notification> in code stays',
  '```',
  '',
  ...Array.from(
    { length: 24 },
    (_, i) => `Line ${i + 1}: more words so the conversation can scroll, needle ${i}.`,
  ),
].join('\n');

const RAW =
  /<\/?(task-notification|task-id|tool-use-id|output-file|status|summary|result|system-reminder|command-name|command-args|command-message|local-command-stdout|div)\b/;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const line = (ago: number, message: { role: 'user' | 'assistant'; content: unknown }) =>
  JSON.stringify({
    type: message.role,
    cwd: repo,
    timestamp: new Date(Date.now() - ago).toISOString(),
    message,
  });

test.beforeAll(() => {
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  mkdirSync(folder, { recursive: true });
  const user = (ago: number, content: unknown) => line(ago, { role: 'user', content });
  const file = join(folder, `${ID}.jsonl`);
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'ai-title', aiTitle: 'Conversation wrappers' }),
      user(2 * DAY, 'An older question from two days ago'),
      line(2 * DAY - MIN, {
        role: 'assistant',
        content: [{ type: 'text', text: 'An older answer.' }],
      }),
      ...Array.from({ length: 8 }, (_, i) => [
        user((200 - i) * MIN, `Older question ${i + 1}`),
        line((199 - i) * MIN, {
          role: 'assistant',
          content: [{ type: 'text', text: `Older answer ${i + 1}. `.repeat(30) }],
        }),
      ]).flat(),
      user(
        90 * MIN,
        '<command-message>compact</command-message>\n<command-name>/compact</command-name>\n<command-args>keep tests</command-args>',
      ),
      user(89 * MIN, '<local-command-stdout>Compacted \u001b[1mok\u001b[0m</local-command-stdout>'),
      user(30 * MIN, TASK('completed', 'Background command "pnpm test" completed (exit code 0)')),
      user(
        20 * MIN,
        '<system-reminder>Plan mode is active. Be careful.\n<cwd>/repo</cwd></system-reminder>Please summarize the build</div>',
      ),
      line(10 * MIN, { role: 'assistant', content: [{ type: 'text', text: REPLY }] }),
      user(9 * MIN, TASK('failed', 'Background command "pnpm lint" failed with exit code 2')),
      user(8 * MIN, '[Request interrupted by user]'),
      user(2 * MIN, 'A last question after the interrupt'),
    ].join('\n') + '\n',
  );
  const when = new Date(Date.now() - 5_000);
  utimesSync(file, when, when);
  claude = spawn('bash', ['-c', 'exec -a claude sleep 900'], { cwd: repo, stdio: 'ignore' });
});
test.afterAll(() => {
  claude?.kill();
  rmSync(folder, { recursive: true, force: true });
});

const proseText = (page: Page) =>
  page.locator('.conversation').evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('code, pre, input').forEach((n) => n.remove());
    return copy.textContent ?? '';
  });

async function open(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript(
    ([key, at]) => window.localStorage.setItem('aether.sessionSeen', JSON.stringify({ [key]: at })),
    [`claude:${ID}`, Date.now() - 60 * MIN] as const,
  );
  await enter(page, 'en', REPO, theme);
  const row = page.locator('.feed-row', { hasText: 'Conversation wrappers' }).first();
  if ((page.viewportSize()?.width ?? 1440) < 760)
    await page.getByRole('button', { name: 'Open the session list' }).tap();
  await row.click();
  await expect(page.locator('.conversation .turn').first()).toBeVisible({ timeout: 20000 });
}

for (const theme of ['dark', 'light'] as const) {
  test(`no raw wrapper reaches the conversation, and the notices are chips (${theme})`, async ({
    page,
  }) => {
    await open(page, theme);
    const chat = page.locator('.conversation');
    const text = await proseText(page);
    expect(text).not.toMatch(RAW);
    for (const leaked of [
      'b3k9x2',
      'toolu_01ABCdef',
      '/tmp/tasks',
      'task-notification',
      'system-reminder',
    ])
      expect(text).not.toContain(leaked);
    await expect(chat).toContainText('Map<K, V>');
    await expect(chat).toContainText('std::vector<int>');
    await expect(chat).toContainText('Promise<void>');
    await expect(chat.locator('code', { hasText: 'Array<string>' })).toBeVisible();
    await expect(
      chat.locator('pre', { hasText: '</task-notification> in code stays' }),
    ).toBeVisible();

    await expect(
      chat.locator('.sys-notice.ok', { hasText: 'Background task finished · exit 0' }),
    ).toBeVisible();
    await expect(
      chat.locator('.sys-notice.failed', { hasText: 'Background task failed · exit 2' }),
    ).toBeVisible();
    await expect(chat.locator('.sys-notice', { hasText: '/compact' })).toContainText('keep tests');
    await expect(chat.locator('.sys-notice', { hasText: 'Command output' })).toContainText(
      'Compacted ok',
    );
    await expect(chat.locator('.sys-notice', { hasText: 'Interrupted by user' })).toBeVisible();
    await expect(
      chat.locator('.msg.user', { hasText: 'Please summarize the build' }),
    ).toBeVisible();

    const context = chat.locator('.sys-notice', { hasText: 'Context added' });
    await expect(context).toBeVisible();
    await context.getByRole('button').click();
    await expect(context).toContainText('Plan mode is active');
    await expect(context).toContainText('cwd: /repo');
    expect(await context.textContent()).not.toMatch(RAW);

    // A task chip opens into its summary; the ids and the output path are never there.
    await chat.locator('.sys-notice.ok').getByRole('button').click();
    await expect(chat.locator('.sys-notice.ok')).toContainText(
      'Background command "pnpm test" completed (exit code 0)',
    );
    await expect(page.locator('body')).not.toContainText('b3k9x2');

    await expect(chat.locator('.day-separator').first()).toBeVisible();
    await expect(chat.locator('.unread-divider')).toHaveText('New since you looked');

    // The pill rises in with a short fade: axe must not sample its colors halfway.
    await chat
      .locator('.new-pill')
      .evaluateAll((els) =>
        Promise.all(els.flatMap((el) => el.getAnimations()).map((a) => a.finished)),
      );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.conversation')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `evidence/screenshots/e2e-conversation-notices-${theme}.png` });
  });
}

test('find, keys, the jump pill and density work in the conversation', async ({ page }) => {
  await open(page);
  const chat = page.locator('.conversation');
  const scroller = chat.locator('.conv-scroll');
  await scroller.focus();

  await page.keyboard.press('Control+f');
  const bar = chat.locator('.find-bar');
  await expect(bar).toBeVisible();
  await bar.getByRole('searchbox').fill('needle');
  await expect(bar.locator('.find-count')).toHaveText(/^1 \/ \d+$/);
  const total = Number(((await bar.locator('.find-count').textContent()) ?? '').split('/')[1]);
  expect(total).toBeGreaterThan(10);
  expect(
    await page.evaluate(
      () => (CSS as unknown as { highlights: Map<string, unknown> }).highlights.size,
    ),
  ).toBe(2);
  await page.keyboard.press('Enter');
  await expect(bar.locator('.find-count')).toHaveText(`2 / ${total}`);
  await bar.getByRole('button', { name: 'Previous match' }).click();
  await expect(bar.locator('.find-count')).toHaveText(`1 / ${total}`);
  await bar.getByRole('searchbox').fill('no such words');
  await expect(bar.locator('.find-count')).toHaveText('No matches');
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
  expect(
    await page.evaluate(
      () => (CSS as unknown as { highlights: Map<string, unknown> }).highlights.size,
    ),
  ).toBe(0);

  const turns = chat.locator('[data-turn]');
  const focusedIndex = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-turn]')].indexOf(document.activeElement as Element),
    );
  await scroller.focus();
  await page.keyboard.press('G');
  expect(await focusedIndex()).toBe((await turns.count()) - 1);
  await page.keyboard.press('g');
  await page.keyboard.press('g');
  expect(await focusedIndex()).toBe(0);
  await page.keyboard.press('j');
  expect(await focusedIndex()).toBe(1);
  await page.keyboard.press('k');
  expect(await focusedIndex()).toBe(0);

  const pill = chat.locator('.new-pill');
  await expect(pill).toHaveText('Jump to latest');
  await pill.click();
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
    .toBeLessThan(48);
  await expect(pill).toBeHidden();

  await chat.getByRole('button', { name: 'Compact view' }).click();
  await expect(chat.locator('.conv-body')).toHaveAttribute('data-density', 'compact');
  await chat.getByRole('button', { name: 'Comfortable view' }).click();
  await expect(chat.locator('.conv-body')).toHaveAttribute('data-density', 'comfortable');
});

test('a message copies as Markdown and as plain text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const reply = page.locator('.conversation .msg.assistant', { hasText: 'The build is' });
  await reply.hover();
  await reply.getByRole('button', { name: 'Copy as plain text' }).click();
  const plain = await page.evaluate(() => navigator.clipboard.readText());
  expect(plain).toContain('The build is green.');
  expect(plain).not.toContain('**');
  await reply.getByRole('button', { name: 'Copy as Markdown' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('**green**');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the conversation has no raw wrapper, no sideways scroll, and its chips fit', async ({
    page,
  }) => {
    await open(page);
    const chat = page.locator('.conversation');
    expect(await proseText(page)).not.toMatch(RAW);
    await expect(chat.locator('.sys-notice').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const wide = await chat
      .locator('.conv-scroll')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(wide).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'evidence/screenshots/e2e-conversation-notices-phone.png' });
  });
});
