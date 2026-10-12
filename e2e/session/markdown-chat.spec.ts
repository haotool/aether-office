import { test, expect, type Page } from '@playwright/test';
import { signIn as signInTo } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const home = realpathSync(process.env['AETHER_LOCAL_SESSIONS_HOME']!);
const repo = join(home, 'md-repo');
const transcript = join(home, '.claude/projects/md/md-chat-session.jsonl');
let claude: ChildProcess | undefined;

const REPLY = [
  '## Cleanup done',
  '',
  '收斂清理已派給… **我已做的（只動分支與暫存，不動程式碼）：**',
  '- 已移除 16 個 `fix/stale-chunk-blank-page` 分支',
  '  - 其中 *3 個* 是 ~~過期~~ 的',
  '- [x] 暫存清單已清空',
  '- [ ] 遠端分支等你點頭',
  '',
  '1. first',
  '2. second',
  '',
  '| file | change |',
  '|------|--------|',
  '| `a.ts` | **new** |',
  '',
  '> quoted line',
  '',
  '```ts',
  'const answer = 42;',
  '```',
  '',
  '[docs](https://example.com/docs) [bad](javascript:alert(1)) ![chart](https://evil.example/p.png)',
  '',
  'A long closing paragraph so the reply is cut by the server in the middle of this sentence, which keeps going for a while: ' +
    'word '.repeat(80),
].join('\n');

test.beforeAll(() => {
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  mkdirSync(join(home, '.claude/projects/md'), { recursive: true });
  const line = (v: unknown) => JSON.stringify(v) + '\n';
  const turn = (prompt: string, text: string) =>
    line({
      type: 'user',
      cwd: repo,
      timestamp: new Date().toISOString(),
      message: { role: 'user', content: prompt },
    }) +
    line({
      type: 'assistant',
      cwd: repo,
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text }] },
    });
  const tall = Array.from(
    { length: 60 },
    (_, i) => `Step ${i + 1}: a line of the long answer.`,
  ).join('\n\n');
  writeFileSync(transcript, turn('explain everything', tall) + turn('clean up', REPLY));
  claude = spawn('bash', ['-c', 'exec -a claude sleep 900'], { cwd: repo, stdio: 'ignore' });
});

test.afterAll(() => {
  claude?.kill();
  rmSync(transcript, { force: true });
});

async function signIn(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript(
    (chosen) =>
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: { locale: 'en', view: '3d', advanced: true, theme: chosen },
          version: 0,
        }),
      ),
    theme,
  );
  await signInTo(page, '/office');
}

const RAW = /\*\*|`|\]\(|^#|~~|!\[|^\s*[-*]\s/m;

test('the feed row, the conversation and the speech endpoint show Markdown as text, not syntax', async ({
  page,
}) => {
  await signIn(page);
  const row = page.locator('.feed-row', { hasText: 'md-repo' }).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await expect(row.locator('.feed-reply')).toContainText('Cleanup done');
  const preview = (await row.locator('.feed-reply').textContent()) ?? '';
  expect(preview).not.toMatch(RAW);

  const speech = await page.request.get('/api/local-sessions/speech');
  const said = (await speech.json()).speech['claude:md-chat-session'].assistant.text as string;
  expect(said.length).toBeLessThanOrEqual(460);
  expect(said).toMatch(/…$/);
  expect((said.match(/```/g) ?? []).length % 2).toBe(0);
  expect((said.match(/\*\*/g) ?? []).length % 2).toBe(0);

  await row.click();
  const body = page.locator('.msg.assistant .markdown').last();
  await expect(body).toBeVisible({ timeout: 20_000 });
  expect(await body.locator('.md-heading').first().textContent()).toBe('Cleanup done');
  await expect(body.locator('strong').first()).toContainText('我已做的');
  await expect(body.locator('li code').first()).toHaveText('fix/stale-chunk-blank-page');
  await expect(body.locator('ul ul li')).toHaveCount(1);
  await expect(body.locator('del')).toHaveText('過期');
  await expect(body.locator('.md-task')).toHaveCount(2);
  await expect(body.locator('ol li')).toHaveCount(2);
  await expect(body.locator('table th')).toHaveText(['file', 'change']);
  await expect(body.locator('blockquote')).toContainText('quoted line');
  await expect(body.locator('.code-block figcaption span').first()).toHaveText('ts');
  const links = body.locator('a');
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute('href', 'https://example.com/docs');
  await expect(links.first()).toHaveAttribute('rel', /noopener/);
  await expect(body.locator('img')).toHaveCount(0);
  const text = (await body.textContent()) ?? '';
  expect(text).toContain('bad');
  expect(text).toContain('chart');
  expect(text).not.toMatch(/\*\*|\]\(|```|javascript:|~~/);
  expect(await page.evaluate(() => document.querySelectorAll('a[href^="javascript"]').length)).toBe(
    0,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include('.conv-body')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('a tall older reply folds, and a reply that arrives live fades in word by word (history never does)', async ({
  page,
}) => {
  await signIn(page);
  await page.locator('.feed-row', { hasText: 'md-repo' }).first().click();
  const folded = page.locator('.long.folded');
  await expect(folded).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('.msg.enter')).toHaveCount(0);
  await page.locator('.long-toggle').click();
  await expect(folded).toHaveCount(0);
  await expect(page.locator('.long-toggle')).toHaveText('Show less');
  appendFileSync(
    transcript,
    JSON.stringify({
      type: 'assistant',
      cwd: repo,
      timestamp: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Fresh **arrival** with several words to reveal.' }],
      },
    }) + '\n',
  );
  const fresh = page.locator('.msg.assistant.enter');
  await expect(fresh).toHaveCount(1, { timeout: 20_000 });
  expect(await fresh.locator('.markdown .w').count()).toBeGreaterThan(4);
  await expect(fresh.locator('strong')).toHaveText('arrival');
});

test('the rendered conversation is accessible in the light theme too', async ({ page }) => {
  await signIn(page, 'light');
  await page.locator('.feed-row', { hasText: 'md-repo' }).first().click();
  await expect(page.locator('.msg.assistant .markdown table')).toBeVisible({ timeout: 20_000 });
  expect(
    (
      await new AxeBuilder({ page })
        .include('.conv-body')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
