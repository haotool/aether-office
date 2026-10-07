import { test, expect, type Browser, type Page } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Office life (docs/design/office-life.md section 5): the little decorative moments, their settings and the aria log. The
// preview address (`?preview=life&effect=<id>&t=<ms>`) holds one effect on a member of the demo office, so the scheduler,
// the settings, the tier and the motion gates are seen end to end without waiting for a real session to do something.
const LOG = '[role="log"]';

type Seed = {
  theme?: 'dark' | 'light';
  locale?: 'en' | 'zh-TW';
  life?: Record<string, unknown>;
  quality?: string;
  reducedMotion?: boolean;
  version?: number;
};

async function open(page: Page, path: string, seed: Seed = {}) {
  const { theme = 'dark', locale = 'en', life, version = 0, ...rest } = seed;
  await page.addInitScript(
    ([state, v]) => {
      // Seeded once per tab: a reload keeps what the page itself saved since.
      if (window.sessionStorage.getItem('seeded')) return;
      window.sessionStorage.setItem('seeded', '1');
      window.localStorage.setItem('aether-ui-preferences', JSON.stringify({ state, version: v }));
    },
    [
      {
        theme,
        locale,
        view: '3d',
        autoCamera: false,
        panelCollapsed: true,
        ...(life ? { life } : {}),
        ...rest,
      },
      version,
    ] as const,
  );
  await signIn(page);
  await page.goto(path);
}

/** A scenario on a page of its own: signed in, with these preferences, at this address. */
async function scenario(browser: Browser, path: string, seed: Seed = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await open(page, path, seed);
  return { page, close: () => context.close() };
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('aether-ui-preferences') ?? '{}'));
const logText = (page: Page) => page.locator(LOG).allInnerTexts();
// `legacy=1`: no squad zones, so the fixture subagent's own join is not said ahead of the effect in the shared log.
const duck = '/office?preview=life&effect=rubber-duck&t=4000&legacy=1';
const heard = /is thinking it through with the rubber duck/;

test.describe('the aria log', () => {
  test('announces a preview effect once, politely, in the page language', async ({ page }) => {
    await open(page, duck);
    await expect(page.locator(LOG)).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator(LOG)).toHaveAttribute('aria-label', /Office activity \(decorative\)/);
    await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
    expect((await logText(page)).join(' ')).toMatch(heard);
    await page.waitForTimeout(1500); // seats and camera settle: it is not announced again
    await expect(page.locator(`${LOG} p`)).toHaveCount(1);
  });

  test('speaks Traditional Chinese for a Chinese page', async ({ page }) => {
    await open(page, duck, { locale: 'zh-TW' });
    await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator(LOG)).toHaveAttribute('aria-label', /辦公室動態（裝飾）/);
    expect((await logText(page)).join(' ')).toMatch(/正在跟橡皮鴨一起想/);
  });

  const silent = async (browser: Browser, seed: Seed, path = duck) => {
    const { page, close } = await scenario(browser, path, seed);
    await page.locator('canvas').first().waitFor({ timeout: 30_000 });
    await expect(page.locator('.scene-warming')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(4000); // long enough for an effect that was going to show to have been announced
    await expect(page.locator(`${LOG} p`)).toHaveCount(0);
    await close();
  };

  test('says nothing in Calm mode', async ({ browser }) => {
    await silent(browser, { life: { calm: true } });
  });

  test('says nothing from a kind that is switched off', async ({ browser }) => {
    await silent(browser, { life: { calm: false, categories: { wellbeing: false } } });
  });

  test('says nothing on the low quality tier', async ({ browser }) => {
    await silent(browser, { quality: 'low' });
  });

  test('with reduced motion keeps a still effect', async ({ page }) => {
    await open(page, duck, { reducedMotion: true, life: { calm: false } });
    await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
  });

  test('with reduced motion drops an effect that is only motion', async ({ browser }) => {
    await silent(
      browser,
      { reducedMotion: true, life: { calm: false } },
      '/office?preview=life&effect=coffee-refill&t=2000&legacy=1',
    );
  });
});

test.describe('real signals', () => {
  const konami = async (page: Page) => {
    await page.locator('canvas').first().waitFor({ timeout: 30_000 });
    await expect(page.locator('.scene-warming')).toHaveCount(0, { timeout: 30_000 });
    for (const key of [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a',
    ])
      await page.keyboard.press(key);
  };

  test('the Konami code, typed on the keyboard, is announced', async ({ page }) => {
    await open(page, '/office', { life: { calm: false } });
    await konami(page);
    await expect(page.locator(`${LOG} p`, { hasText: 'Konami' })).toHaveText('Konami code!', {
      timeout: 10_000,
    });
  });

  test('Calm mode silences the Konami code', async ({ page }) => {
    await open(page, '/office', { life: { calm: true } });
    await konami(page);
    await page.waitForTimeout(1500); // awaits nothing: gives an announcement that wrongly came time to show
    await expect(page.locator(`${LOG} p`, { hasText: 'Konami' })).toHaveCount(0); // a squad's join is not Calm's to silence
  });
});

/** The fixture session's project is selected in the office, so its hook spool is what the scene reads. */
async function watchFixtureRepo(page: Page) {
  const picker = page.locator('.project-picker select');
  await expect(picker.locator('option', { hasText: 'fixture-repo' })).toBeAttached({
    timeout: 15_000,
  });
  await picker.selectOption({ label: 'fixture-repo' });
  await expect(page.locator('.scene-label', { hasText: 'fixture-repo' })).toBeVisible({
    timeout: 15_000,
  });
}

// A hook record exactly as the hook receiver writes one: the tool, the first words of the command, its labels and, when
// the provider said so, how it ended. The fixture's own records sit an hour ahead, so these come after them.
let spoolTick = 0;
/** Back to the fixture's own records (the subagent's), so one test's calls are not another's news. */
function resetSpool() {
  const file = process.env['AETHER_HOOK_SPOOL']!;
  const own = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.includes('"agentId"'));
  writeFileSync(file, own.join('\n') + '\n');
}
function spool(event: string, extra: Record<string, unknown>) {
  const home = process.env['AETHER_LOCAL_SESSIONS_HOME']!;
  appendFileSync(
    process.env['AETHER_HOOK_SPOOL']!,
    JSON.stringify({
      at: Date.now() + 2 * 3_600_000 + (spoolTick += 1) * 1000,
      provider: 'claude',
      event,
      sessionId: 'e2e-session',
      cwd: join(home, 'fixture-repo'),
      ...extra,
    }) + '\n',
  );
}
const bash = (id: string, target: string, tags: string[]) =>
  spool('PreToolUse', { tool: 'Bash', target, tags, toolUseId: id });
const heardLines = (page: Page, words: RegExp) => page.locator(`${LOG} p`, { hasText: words });

test('a real test run is shown as the provider stated it: an unknown outcome says nothing, then fail, edit, pass is the changed-tests joke', async ({
  page,
}) => {
  resetSpool();
  // Normal frequency: "rare" would halve the meme's chance, and this is about what is shown, not the draw.
  await open(page, '/office', {
    life: { calm: false, frequency: 'normal' },
    panelCollapsed: false,
  });
  await watchFixtureRepo(page);
  const claimed = /tests were changed|exited successfully/;

  // fail, an edit to a test file, then a pass whose outcome the provider did not state: nothing is claimed, however long we wait.
  bash('f1', 'make check', ['test']);
  spool('PostToolUseFailure', { tool: 'Bash', toolUseId: 'f1', ok: false });
  spool('PreToolUse', { tool: 'Edit', target: 'app.test.ts' });
  bash('u1', 'make check', ['test']);
  spool('PostToolUse', { tool: 'Bash', toolUseId: 'u1' });
  await page.waitForTimeout(6000);
  await expect(heardLines(page, claimed)).toHaveCount(0);

  // The same pass, now with its real exit status: the sign flips from BUG to FEATURE (said, never claimed as a fix).
  await page.waitForTimeout(4000); // a failure's own moment, if it was drawn, is over: one effect per member at a time
  bash('p1', 'make check', ['test']);
  spool('PostToolUse', { tool: 'Bash', toolUseId: 'p1', ok: true });
  await expect(heardLines(page, /The tests were changed, then passed/)).toHaveCount(1, {
    timeout: 30_000,
  });

  // The member's conversation lists the moment, closed by default and marked decorative.
  await page.locator('.session-panel .feed-row', { hasText: 'fixture-repo' }).first().click();
  const moments = page.locator('.conv-moments');
  await expect(moments).toBeVisible();
  await expect(moments).not.toHaveAttribute('open', '');
  await expect(moments.locator('summary')).toContainText(/Recent moments/);
  await expect(moments.locator('summary')).toContainText(/decorative/);
  await moments.locator('summary').click();
  await expect(moments.locator('li', { hasText: /tests were changed/ })).toHaveCount(1);
});

test('a push is "pushed" only once it exited successfully', async ({ page }) => {
  resetSpool();
  await open(page, '/office', { life: { calm: false } });
  await watchFixtureRepo(page);
  bash('g1', 'git push', ['git.push']);
  await page.waitForTimeout(5000);
  await expect(heardLines(page, /pushed/)).toHaveCount(0); // started: nothing to say about the end
  spool('PostToolUse', { tool: 'Bash', toolUseId: 'g1', ok: true });
  await expect(heardLines(page, /pushed/)).toHaveCount(1, { timeout: 30_000 });
});

// The wave 2 effects, held on a member by the preview address (which skips the draw and the cooldowns): what a screen reader hears.
test.describe('wave 2 moments', () => {
  const heardFor: [string, RegExp][] = [
    ['ci-pass', /test command exited successfully/],
    ['ci-fail', /test command failed/],
    ['build-error', /build command failed/],
    ['force-push', /started a force push/],
    ['merge-conflict', /repository has 40 conflicted files/],
    ['launch-pad', /started a deploy/],
    ['friday-deploy', /deploy on a Friday afternoon/],
    ['skull-gag', /started a recursive delete command/],
    ['lgtm', /approved a pull request/],
    ['works-machine', /pass in one session and fail in another/],
    ['not-a-bug', /tests were changed, then passed/],
    ['sudo-prompt', /command with sudo/],
    ['curl-pipe', /pipes a download into a shell/],
  ];
  for (const [effect, words] of heardFor)
    test(`${effect} is announced, once`, async ({ page }) => {
      await open(page, `/office?preview=life&effect=${effect}&t=1500&legacy=1`);
      await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
      expect((await logText(page)).join(' ')).toMatch(words);
    });

  test('the CI stack words its exit status, never "CI passed"', async ({ page }) => {
    await open(page, '/office?preview=life&effect=ci-stack:0&t=1500&legacy=1');
    await expect(page.locator(`${LOG} p`)).toHaveCount(1, { timeout: 30_000 });
    expect((await logText(page)).join(' ')).toMatch(/CI watch command exited with an error/);
  });
});

test.describe('settings', () => {
  test('Office → Animations: Calm mode, kinds, frequency and the intro persist', async ({
    page,
  }) => {
    await open(page, '/settings/office');
    const calm = page.getByRole('switch', { name: 'Calm mode', exact: true });
    await expect(calm).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Tests and builds' })).toBeEnabled();
    await calm.check();
    expect((await stored(page)).state.life.calm).toBe(true);
    await expect(page.getByRole('switch', { name: 'Tests and builds' })).toBeDisabled();
    await calm.uncheck();
    await page.getByRole('switch', { name: 'Memes', exact: true }).uncheck();
    await page.getByRole('radio', { name: 'Normal' }).click();
    await page.getByRole('radio', { name: 'Never' }).click();
    const state = (await stored(page)).state;
    expect(state.life).toMatchObject({
      calm: false,
      frequency: 'normal',
      categories: { meme: false, work: true, easter: true },
    });
    expect(state.intro).toBe('never');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Memes', exact: true })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Normal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Replay intro opens the office page and plays the tour, even under automation and with "Never"', async ({
    page,
  }) => {
    await open(page, '/settings/office', { intro: 'never' });
    await page.getByRole('button', { name: 'Replay intro' }).click();
    await expect(page).toHaveURL(/\/office/);
    await expect(page.locator('.intro-caption').getByRole('status')).toHaveText(
      /Welcome to the office/,
      { timeout: 40_000 },
    );
  });

  test('the phone drawer has a Calm mode switch that is the same setting', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 }, // on its side, a phone's navigation is the drawer
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await open(page, '/office');
    await page.locator('.mobile-menu').tap();
    const calm = page
      .locator('.sidebar.open .quick-prefs')
      .getByRole('button', { name: 'Calm mode' });
    await expect(calm).toHaveAttribute('aria-pressed', 'false');
    await calm.tap();
    await expect(calm).toHaveAttribute('aria-pressed', 'true');
    expect((await stored(page)).state.life.calm).toBe(true);
    await context.close();
  });

  test('upgrades stored preferences of version 0, keeping them and adding the defaults', async ({
    page,
  }) => {
    await open(page, '/settings/office', { version: 0 });
    const after = await stored(page);
    expect(after.version).toBe(1);
    expect(after.state.life.calm).toBe(false);
    expect(after.state.life.relation).toBe(true);
    expect(after.state.locale).toBe('en');
  });

  test('starts Calm mode on when the system asks for reduced motion', async ({ browser }) => {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      storageState: { cookies: [], origins: [] }, // a first visit: nothing stored yet
    });
    const page = await context.newPage();
    await signIn(page);
    await page.goto('/settings/office');
    await expect(page.getByRole('switch', { name: /Calm mode|平靜模式/ })).toBeChecked();
    await context.close();
  });

  for (const theme of ['dark', 'light'] as const)
    test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
      await open(page, '/settings/office', { theme });
      await expect(page.getByRole('switch', { name: 'Calm mode', exact: true })).toBeVisible();
      const results = await new AxeBuilder({ page }).include('#s-office').analyze();
      expect(results.violations).toEqual([]);
    });

  test('is findable by search', async ({ page }) => {
    await open(page, '/settings');
    await page.getByRole('searchbox').fill('easter');
    await expect(page.getByRole('switch', { name: 'Easter eggs' })).toBeVisible();
  });
});
