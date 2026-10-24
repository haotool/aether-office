import { test, expect, type Page } from '@playwright/test';
import { frames, throughout } from '../support/settled.js';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

async function enter(page: Page, query: string, prefs: Record<string, unknown> = {}) {
  await page.addInitScript((state) => {
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({
        state: {
          theme: 'dark',
          locale: 'en',
          quality: 'balanced',
          view: '3d',
          ...state,
        },
        version: 0,
      }),
    );
  }, prefs);
  await signIn(page, `/?${query}`);
  await page.locator('canvas').first().waitFor({ timeout: 30000 });
}

test('the fixture subagent sits in a squad zone with a focusable label', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, '');
  await page.locator('.project-picker select').selectOption({ label: 'fixture-repo' });
  const zone = page.getByRole('button', { name: /^Squad of .*, 1 working$/ });
  await expect(zone).toBeAttached({ timeout: 15000 });
  await expect(page.locator('.scene-label', { hasText: 'Explore' })).toBeAttached();
  await expect(page.getByRole('log', { name: 'Office activity (decorative)' })).toBeAttached();
  await expect(page.getByRole('log')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('arrivals and departures are announced, and the zone label counts the squad', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'squad=3&arrive=3000&leave=9000');
  const log = page.getByRole('log', { name: 'Office activity (decorative)' });
  await expect(log).toContainText('joined', { timeout: 20000 });
  await expect(log).toContainText('squad', { timeout: 20000 });
  await expect(page.getByRole('button', { name: /^Squad of .*, \d+ working/ })).toBeAttached();
  await expect(log).toContainText('left the squad', { timeout: 30000 });
  expect(errors).toEqual([]);
});

test('reduced motion and the low tier show the same squad without walks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page, 'squad=2&arrive=3000', { reducedMotion: true, quality: 'low' });
  await expect(page.getByRole('log', { name: 'Office activity (decorative)' })).toContainText(
    'joined',
    {
      timeout: 20000,
    },
  );
  await expect(page.getByRole('button', { name: /^Squad of .*, \d+ working/ })).toBeAttached();
  expect(errors).toEqual([]);
});

for (const theme of ['dark', 'light'] as const)
  test(`the squad label passes the accessibility sweep in the ${theme} theme`, async ({ page }) => {
    await enter(page, 'squad=3', { theme });
    await expect(page.getByRole('button', { name: /^Squad of .*, \d+ working/ })).toBeAttached({
      timeout: 15000,
    });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

test('the Chinese interface names the squad and its moments', async ({ page }) => {
  await enter(page, 'squad=2&arrive=3000', { locale: 'zh-TW' });
  await expect(page.getByRole('log', { name: '辦公室動態（裝飾）' })).toContainText('加入了', {
    timeout: 20000,
  });
  await expect(page.getByRole('button', { name: /的小隊，\d+ 位運作中/ })).toBeAttached();
});

const LOG = (page: Page) => page.getByRole('log', { name: /Office activity|辦公室動態/ });

test.describe('hand-over', () => {
  test('a finished subagent hands its result over, and the log says so once, as a receipt', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await enter(page, 'squad=1&leave=4000&tools=900&look=desk');
    const log = LOG(page);
    await expect(log).toContainText('handed over its result', { timeout: 45000 });
    const text = await log.innerText();
    expect(text.match(/handed over its result/g)).toHaveLength(1);
    expect(text).not.toMatch(/approv|passed|succeeded|failed/i);
    expect(text).not.toContain('marked as an error');
    expect(errors).toEqual([]);
  });

  test('a result flagged as an error is handed over as returned, never as a plain receipt', async ({
    page,
  }) => {
    await enter(page, 'squad=1&leave=4000&tools=900&look=desk&result=error');
    await expect(LOG(page)).toContainText('handed over its result, marked as an error', {
      timeout: 45000,
    });
  });

  test('reduced motion and the low tier hand over by receipt, without the walk', async ({
    page,
  }) => {
    await enter(page, 'squad=1&leave=3000', { reducedMotion: true, quality: 'low' });
    await expect(LOG(page)).toContainText('handed over its result', { timeout: 45000 });
  });

  test('with the relation effects off a finished subagent just leaves', async ({ page }) => {
    await enter(page, 'squad=1&leave=3000&relation=0');
    await expect(LOG(page)).toContainText('left the squad', { timeout: 45000 });
    // With the relation effects off the hand-over must never be announced.
    await throughout(page, () => expect(LOG(page)).not.toContainText('handed over'), 480);
  });

  test('the Chinese interface says it in Chinese', async ({ page }) => {
    await enter(page, 'squad=1&leave=3000', { locale: 'zh-TW' });
    await expect(LOG(page)).toContainText('交回了結果', { timeout: 45000 });
  });

  for (const theme of ['dark', 'light'] as const)
    test(`passes the accessibility sweep while a result is handed over, in the ${theme} theme`, async ({
      page,
    }) => {
      await enter(page, 'squad=2&leave=4000&tools=900', { theme });
      await expect(LOG(page)).toContainText('handed over its result', { timeout: 45000 });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
});

const stringLayers = (page: Page) =>
  page.evaluate(() => {
    const rig = (window as unknown as { __aetherPerfRig?: { scene: import('three').Object3D } })
      .__aetherPerfRig;
    let found = 0;
    rig?.scene.traverse((n) => {
      if (n.type === 'LineSegments2' && n.renderOrder === 3 && n.visible) found += 1;
    });
    return rig ? found : -1;
  });

test('team workstations replace puppet strings, including old saved preferences', async ({
  page,
}) => {
  await enter(page, 'perf=1&squad=3&tools=900', { strings: true });
  await page.waitForFunction(() => '__aetherPerfRig' in window, undefined, { timeout: 30000 });
  await frames(page, 150);
  expect(await stringLayers(page)).toBe(0);
  await expect(page.getByRole('button', { name: /^Squad of / })).toBeAttached();
  await page.goto('/settings/office');
  await expect(page.getByRole('switch', { name: 'Puppet strings', exact: true })).toHaveCount(0);
});

test('the beam says it follows tokens when subagents report them, and the zone label reads the rate out', async ({
  page,
}) => {
  await enter(page, 'squad=3&tokens=12000');
  const zone = page.getByRole('button', { name: /^Squad of .*, \d+ working, ~\d+K tokens\/min/ });
  await expect(zone).toBeAttached({ timeout: 20000 });
  await expect(zone).toHaveAccessibleName(/\(based on tokens\)$/);
  await expect(zone).toHaveAttribute('title', /^~\d+K tokens\/min \(based on tokens\)$/);
});

test('without token data the beam falls back to tool calls and says so', async ({ page }) => {
  await enter(page, 'squad=2&tools=1500');
  const zone = page.getByRole('button', { name: /tool calls\/min \(based on tool calls\)$/ });
  await expect(zone).toBeAttached({ timeout: 30000 });
  await expect(zone).not.toHaveAccessibleName(/token/);
  await expect(zone).toHaveAttribute('title', /^~\d+ tool calls\/min \(based on tool calls\)$/);
});

test('the Chinese interface words the beam rate with its basis', async ({ page }) => {
  await enter(page, 'squad=2&tokens=12000', { locale: 'zh-TW' });
  await expect(
    page.getByRole('button', { name: /約 [\d.]+萬 tokens\/分鐘（依 token 用量）$/ }),
  ).toBeAttached({
    timeout: 20000,
  });
});
