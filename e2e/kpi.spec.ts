import { test, expect, type Page } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  claudeLine,
  codexContext,
  codexCount,
  codexMeta,
  writeLines,
} from '../tests/aether/usage-fixtures.js';

// KPIs of the building from synthetic transcripts (real shapes, no real text) in the fixture home: the strip over the
// office, the dashboard it opens, each floor's card in the floor switcher and the floor's plaque.
const home = process.env['AETHER_LOCAL_SESSIONS_HOME']!;
// Its own repository, so the other specs' fixture repository and its session stay as they were.
const repo = join(home, 'kpi-repo');
const transcripts = [
  join(home, '.claude/projects/p/kpi-claude.jsonl'),
  join(home, '.codex/sessions', new Date().toISOString().slice(0, 10).replaceAll('-', '/')),
];
test.afterAll(() => {
  for (const path of transcripts) rmSync(path, { recursive: true, force: true });
});

test.beforeAll(() => {
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  const now = Date.now();
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=kpi', '-c', 'user.email=kpi@t', ...args], {
      encoding: 'utf8',
    });
  git('commit', '-q', '--allow-empty', '-m', 'kpi one');
  git('commit', '-q', '--allow-empty', '-m', 'kpi two');
  // Claude: two messages (the second one's usage repeated on a second line, as the CLI writes it), two models.
  writeLines(join(home, '.claude/projects/p/kpi-claude.jsonl'), [
    JSON.stringify({ type: 'user', cwd: repo }),
    claudeLine('msg_a', at(600), { i: 1200, cw: 300, cr: 40_000, o: 800 }, { tools: 2, cwd: repo }),
    claudeLine(
      'msg_b',
      at(540),
      { i: 100, cr: 41_000, o: 400 },
      { model: 'claude-opus-5-5', cwd: repo },
    ),
    claudeLine(
      'msg_b',
      at(539),
      { i: 100, cr: 41_000, o: 400 },
      { model: 'claude-opus-5-5', cwd: repo },
    ),
  ]);
  // The usage cache the claude-hud plugin keeps: the 5-hour window at 12%, the 7-day one at 64%.
  const iso = (ms: number) => new Date(now + ms).toISOString();
  writeFileSync(
    process.env['AETHER_CLAUDE_USAGE_FILE']!,
    JSON.stringify({
      timestamp: now,
      data: {
        planName: 'Max',
        fiveHour: 12,
        sevenDay: 64,
        fiveHourResetAt: iso(2 * 3_600_000),
        sevenDayResetAt: iso(3 * 86_400_000),
      },
    }),
  );
  // Codex: a session with a rate-limit reading whose window resets in three hours.
  const day = new Date(now).toISOString().slice(0, 10).replaceAll('-', '/');
  const rollout = join(
    home,
    '.codex/sessions',
    day,
    'rollout-kpi-019d0000-0000-7000-8000-0000000000aa.jsonl',
  );
  mkdirSync(join(home, '.codex/sessions', day), { recursive: true });
  writeLines(rollout, [
    codexMeta(at(300), repo),
    codexContext(at(299), 'gpt-5.5'),
    codexCount(
      at(120),
      { input: 5000, cached: 3000, output: 600, reasoning: 200 },
      { input: 5000, cached: 3000, output: 600, reasoning: 200 },
      true,
    ).replace(/"resets_at":4000000000/g, `"resets_at":${Math.floor(now / 1000) + 3 * 3600}`),
  ]);
});

async function open(
  page: Page,
  options: { theme?: 'dark' | 'light'; reducedMotion?: boolean } = {},
) {
  await page.addInitScript(
    ([theme, reduced]) =>
      window.localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: {
            theme,
            locale: 'en',
            quality: 'low',
            view: '3d',
            reducedMotion: reduced,
            advanced: true,
          },
          version: 0,
        }),
      ),
    [options.theme ?? 'dark', options.reducedMotion ?? true] as const,
  );
  await signIn(page, '/office');
}

// 1200+300+800 (a) + 100+400 (b, counted once) + Codex 2000 new input + 400 output + 200 reasoning = 5400 tokens today.
const TOKENS_TODAY = '5.4K';

test('the strip shows the building’s KPIs and opens the dashboard with every breakdown', async ({
  page,
}) => {
  await open(page);
  const strip = page.getByRole('group', { name: 'KPI dashboard' });
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip.locator('.kpi-cell').first()).toContainText(TOKENS_TODAY, { timeout: 30_000 });
  await expect(strip.getByText('Commits today')).toBeVisible();
  // the two commits made above: known once the page has adopted the repository as a project
  await expect(strip.locator('.kpi-cell').nth(2)).toContainText('2', { timeout: 40_000 });

  await strip.locator('.kpi-cell').first().click();
  const dialog = page.getByRole('dialog', { name: 'KPI dashboard' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.kpi-headline .kpi-tile').first()).toContainText(TOKENS_TODAY);
  // tokens by kind, with cache reads apart
  const legend = dialog.locator('.stacked-legend');
  await expect(legend).toContainText('Cache read');
  await expect(legend).toContainText('Reasoning');
  await expect(legend.locator('li', { hasText: 'Cache write' })).toContainText('300');
  // a bar per day, the last one today, with a tooltip on focus
  const bars = dialog.locator('.daily-bars li');
  await expect(bars).toHaveCount(7);
  await bars.last().focus();
  await expect(bars.last()).toHaveAttribute('data-tip', /: 5\.4K$/);
  // models and rate-limit windows: Claude's two (12% and 64%) and Codex's (41.5% of its 5-hour window)
  await expect(dialog.locator('.share-list').first()).toContainText('claude-opus-5-5');
  const rings = dialog.locator('.kpi-rings');
  await expect(rings.locator('li', { hasText: 'Claude · 5-hour' })).toContainText('12%');
  await expect(rings.locator('li', { hasText: 'Claude · 7-day' })).toContainText('64%');
  await expect(rings.locator('li', { hasText: 'Codex · 5-hour' })).toContainText('42%');
  await expect(rings.locator('li', { hasText: 'Codex · 5-hour' })).toContainText(
    /resets in [23] h/,
  );
  // Git: the two commits, no branch merged yet
  await expect(dialog.getByText('Commits today').last()).toBeVisible();
  await expect(
    dialog.locator('.kpi-section', { hasText: 'Git activity' }).locator('.kpi-tile').first(),
  ).toContainText('2');
  // the whole building and an office: the same sessions are classified onto the product floor
  await dialog.getByRole('button', { name: /^1F/ }).click();
  await expect(dialog.locator('.kpi-headline .kpi-tile').first()).toContainText(TOKENS_TODAY);
  await dialog.getByRole('button', { name: '30 days' }).click();
  await expect(dialog.locator('.daily-bars li')).toHaveCount(30);
  await dialog.getByRole('button', { name: /^5F/ }).click();
  await expect(dialog.getByText('No token usage recorded in this range yet.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(strip.locator('.kpi-cell').first()).toBeFocused(); // focus goes back to what opened it
});

test('the floor switcher shows each floor’s tokens with a bar, and the floor’s plaque opens its dashboard', async ({
  page,
}) => {
  await open(page);
  const slab = page.locator('.slab', { hasText: '1F' });
  await expect(slab.locator('.slab-kpi')).toContainText(TOKENS_TODAY, { timeout: 30_000 });
  await expect(page.locator('.slab', { hasText: '5F' }).locator('.slab-kpi')).toContainText('0');
  const shares = await page
    .locator('.slab-kpi')
    .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).getPropertyValue('--share')));
  expect(shares).toContain('1'); // the busiest floor fills its bar
  const plaque = page.locator('.floor-plaque');
  await expect(plaque).toBeVisible();
  await expect(plaque).toContainText(TOKENS_TODAY);
  await plaque.click();
  const dialog = page.getByRole('dialog', { name: 'KPI dashboard' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { pressed: true }).first()).toBeVisible();
});

test('on a phone the KPIs are chips that scroll sideways and the dashboard is a bottom sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const chips = page.locator('.phone-kpi .kpi-strip');
  await expect(chips).toBeVisible({ timeout: 30_000 });
  await expect(chips.locator('.kpi-cell').first()).toContainText(TOKENS_TODAY, { timeout: 30_000 });
  expect(
    await chips.evaluate((el) => el.scrollWidth > el.clientWidth || el.clientWidth <= 390),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('.floor-plaque')).toHaveCount(0); // no plaque over a phone's scene
  await chips.locator('.kpi-cell').first().click();
  const dialog = page.getByRole('dialog', { name: 'KPI dashboard' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(389);
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(843); // seated on the bottom edge
  expect(box!.height).toBeLessThanOrEqual(0.9 * 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

for (const theme of ['dark', 'light'] as const)
  test(`the strip and the open dashboard have no accessibility violations in the ${theme} theme`, async ({
    page,
  }) => {
    await open(page, { theme });
    const strip = page.getByRole('group', { name: 'KPI dashboard' });
    await expect(strip.locator('.kpi-cell').first()).toContainText(TOKENS_TODAY, {
      timeout: 30_000,
    });
    // The scene's own "warming up" text is not what is being checked here: wait until it is gone.
    await expect(page.locator('.scene-warming, .scene-loading')).toHaveCount(0, {
      timeout: 40_000,
    });
    const scan = () =>
      new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect((await scan()).violations).toEqual([]);
    await strip.locator('.kpi-cell').first().click();
    await expect(
      page.getByRole('dialog', { name: 'KPI dashboard' }).locator('.kpi-rings'),
    ).toBeVisible();
    expect((await scan()).violations).toEqual([]);
  });

test('a session that starts while the office is open is counted in seconds, not at the 30 s safety net', async ({
  page,
}) => {
  await open(page);
  const tokens = page.getByRole('group', { name: 'KPI dashboard' }).locator('.kpi-cell').first();
  await expect(tokens).toContainText(TOKENS_TODAY, { timeout: 30_000 });
  const late = join(home, '.claude/projects/p/kpi-late.jsonl');
  try {
    writeLines(late, [
      JSON.stringify({ type: 'user', cwd: repo }),
      claudeLine('msg_late', new Date().toISOString(), { i: 1000 }, { cwd: repo }),
    ]);
    await expect(tokens).toContainText('6.4K', { timeout: 15_000 });
  } finally {
    rmSync(late, { force: true });
  }
});
