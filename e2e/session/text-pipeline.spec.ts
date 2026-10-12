import { test, expect } from '@playwright/test';
import { settled } from '../support/settled.js';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { enter, home } from '../support/seats.js';

// A synthetic Claude transcript whose reply is wrapped in a span with a class and whose title is cut in the middle of
// two brackets (both seen on a real machine). No process and no model: the transcripts are files in the fixture home.
const REPO = 'fixture-text';
const repo = join(realpathSync(home), REPO);
let claude: ChildProcess | undefined;
const folder = join(home, '.claude/projects/text');
const SPAN =
  'confirm-rate 的有效設定除了 decision off→on，也包含 R4 false→true，不能僅憑 diff 將數字變化歸因於 decision。';
const UNBALANCED = '【審查邊界（擁有者 10-05';
const LONG =
  '【審查邊界（擁有者 10-05, 程式碼審查, 離線）】 檢查 confirm-rate 的有效設定與回歸風險分析';
const files = [
  ['cccccccc-0000-4000-8000-000000000001', UNBALANCED, `<span class="tx">${SPAN}</span>`],
  ['cccccccc-0000-4000-8000-000000000002', LONG, 'Done.<br>Array<string> and a < b.'],
] as const;

test.beforeAll(() => {
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  mkdirSync(folder, { recursive: true });
  const at = (ago: number) => new Date(Date.now() - ago).toISOString();
  for (const [id, title, reply] of files) {
    const file = join(folder, `${id}.jsonl`);
    writeFileSync(
      file,
      [
        { type: 'ai-title', aiTitle: title },
        {
          type: 'user',
          cwd: repo,
          timestamp: at(60_000),
          message: { role: 'user', content: 'check it' },
        },
        {
          type: 'assistant',
          cwd: repo,
          timestamp: at(30_000),
          message: {
            role: 'assistant',
            model: 'claude-fixture-1',
            content: [{ type: 'text', text: reply }],
          },
        },
      ]
        .map((line) => JSON.stringify(line))
        .join('\n') + '\n',
    );
    const when = new Date(Date.now() - (id.endsWith('1') ? 5_000 : 60_000));
    utimesSync(file, when, when);
  }
  claude = spawn('bash', ['-c', 'exec -a claude sleep 900'], { cwd: repo, stdio: 'ignore' });
});
test.afterAll(() => {
  claude?.kill();
  rmSync(folder, { recursive: true, force: true });
});

const balanced = (text: string) =>
  [...text].filter((c) => '【（([「'.includes(c)).length ===
  [...text].filter((c) => '】）)]」'.includes(c)).length;

for (const theme of ['dark', 'light'] as const) {
  test(`clean text and a balanced name tag (${theme})`, async ({ page }) => {
    await enter(page, 'en', REPO, theme);
    const rows = page.locator('.feed-row');
    await expect(rows.filter({ hasText: REPO })).toHaveCount(2, { timeout: 20000 });
    await expect(rows.filter({ hasText: REPO }).first()).not.toContainText('<span');
    expect(
      balanced(
        (await rows.filter({ hasText: REPO }).first().locator('strong').textContent()) ?? '',
      ),
    ).toBe(true);

    await rows.filter({ hasText: '的有效設定除了 decision' }).click();
    const tag = page.locator('button.scene-label.selected');
    await expect(tag).toBeVisible({ timeout: 15000 });
    await settled(tag);

    const name = (await tag.locator('.tag-name').textContent()) ?? '';
    expect(name).toBe('【審查邊界】');
    expect(balanced(name)).toBe(true);
    expect(name).not.toMatch(/c[lx]·/);
    await expect(tag).toHaveAttribute('aria-label', /^【審查邊界】, .+, .+$/);
    await expect(tag).toHaveAttribute('title', /· cl·cccc$/);

    await expect(tag.locator('.tag-meta')).toContainText(REPO);

    const conversation = page.locator('.conversation');
    await expect(conversation).toContainText(SPAN, { timeout: 15000 });
    await expect(page.locator('body')).not.toContainText('<span');
    await expect(page.locator('body')).not.toContainText('class="tx"');

    await expect(page.locator('.speech-bubble.assistant').first()).toContainText('confirm-rate', {
      timeout: 15000,
    });
    await expect(page.locator('.speech-bubble').first()).not.toContainText('<span');

    expect(
      (
        await new AxeBuilder({ page })
          .include('.world-labels')
          .include('.conversation')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `evidence/screenshots/e2e-text-pipeline-${theme}.png` });
  });
}

test('a long reported title is cut on a boundary and generic types in a reply stay text', async ({
  page,
}) => {
  await enter(page, 'en', REPO);
  await page
    .locator('.feed-row', { hasText: REPO })
    .filter({ hasNotText: '的有效設定除了' })
    .click();
  const tag = page.locator('button.scene-label.selected');
  await expect(tag).toBeVisible({ timeout: 15000 });
  const name = (await tag.locator('.tag-name').textContent()) ?? '';
  expect(balanced(name)).toBe(true);
  expect(name.length).toBeLessThanOrEqual(28);
  await expect(page.locator('.conversation')).toContainText('Array<string> and a < b.', {
    timeout: 15000,
  });
});
