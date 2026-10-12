import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
import { mockGitGraph } from '../support/git-graph.js';
import { frames, throughout } from '../support/settled.js';

// The first-visit camera tour. Browser automation never starts it by itself, so every test asks for it with
// `?intro=force`; `?perf=1` leaves the scene's camera on `window.__aetherPerfRig` so the tests can see where it is.
const CAPTION = /歡迎來到辦公室|Welcome to the office/;
const HOME_RADIUS = Math.hypot(30, 44);
const ORBIT_RADIUS = 84;

async function open(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript((value) => {
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({ state: { theme: value, locale: 'zh-TW', view: '3d' }, version: 0 }),
    );
  }, theme);
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  await page.goto('/office?intro=force&perf=1');
}

type Look = { radius: number; y: number; bearing: number; aspect: number };
const camera = (page: Page) =>
  page.evaluate<Look>(() => {
    const rig = (
      window as unknown as {
        __aetherPerfRig: { camera: { position: { x: number; y: number; z: number } } };
      }
    ).__aetherPerfRig;
    const { x, y, z } = rig.camera.position;
    const canvas = document.querySelector('canvas')!;
    return {
      radius: Math.hypot(x, z),
      y,
      bearing: Math.atan2(x, z),
      aspect: canvas.clientWidth / canvas.clientHeight,
    };
  });
const portrait = (aspect: number) => Math.min(2.4, Math.max(1, 1.25 / aspect));
const LAST = /五層樓，一棟建築|個提交|Five decks|commits/;
async function holds(page: Page, still: Look, begun: () => Promise<boolean>) {
  for (;;) {
    const seen = await camera(page);
    if (await begun()) return;
    expect(seen).toEqual(still);
    await frames(page, 6);
  }
}
const caption = (page: Page) => page.locator('.intro-caption');
const explode = (page: Page) => page.getByRole('button', { name: '分層展開', exact: true });

test('the tour orbits the building at its radius and height, and Esc lands on the start view', async ({
  page,
}) => {
  await open(page);
  await expect(caption(page).getByRole('status')).toHaveText(CAPTION, { timeout: 40000 });
  const a = await camera(page);
  await expect
    .poll(async () => Math.abs((await camera(page)).bearing - a.bearing))
    .toBeGreaterThan(0.01);
  const b = await camera(page);
  const k = portrait(b.aspect);
  expect(b.radius).toBeCloseTo(ORBIT_RADIUS * k, 0);
  expect(b.y).toBeCloseTo(38, 1);
  await expect(explode(page)).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Escape');
  await expect(caption(page)).toHaveCount(0, { timeout: 5000 });
  await expect(explode(page)).toHaveAttribute('aria-pressed', 'false');
  const end = await camera(page);
  expect(end.radius).toBeCloseTo(HOME_RADIUS * portrait(end.aspect), -1);
  expect(await page.evaluate(() => window.sessionStorage.getItem('aether.intro.played'))).toBe('1');
});

test('any input interrupts the tour and leaves the camera exactly where it is', async ({
  page,
}) => {
  await open(page);
  await expect(caption(page)).toBeVisible({ timeout: 40000 });
  const start = await camera(page);
  await expect
    .poll(async () => Math.abs((await camera(page)).bearing - start.bearing))
    .toBeGreaterThan(0.01);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(caption(page)).toHaveCount(0);
  const stopped = await camera(page);
  // Awaits nothing: every look at the camera over the next frames must be the one it stopped at.
  await throughout(
    page,
    async () => {
      const later = await camera(page);
      for (const key of ['radius', 'y', 'bearing'] as const)
        expect(later[key]).toBeCloseTo(stopped[key], 6);
    },
    54,
  );
  expect(stopped.y).toBeCloseTo(38, 1);
  const stored = await page.evaluate(() => window.localStorage.getItem('aether-ui-preferences')!);
  expect(JSON.parse(stored).state.intro ?? 'auto').toBe('auto');
});

test("'Don't show again' is remembered, and Replay plays the tour again", async ({ page }) => {
  await open(page);
  await expect(caption(page)).toBeVisible({ timeout: 40000 });
  await caption(page).getByRole('button', { name: '不再顯示', exact: true }).click();
  await expect(caption(page)).toHaveCount(0);
  const stored = await page.evaluate(() => window.localStorage.getItem('aether-ui-preferences')!);
  expect(JSON.parse(stored).state.intro).toBe('never');

  await page.getByRole('button', { name: '重播開場導覽', exact: true }).click();
  await expect(caption(page).getByRole('status')).toHaveText(CAPTION, { timeout: 20000 });
  await caption(page).getByRole('button', { name: '略過', exact: true }).click();
  await expect(caption(page)).toHaveCount(0);
});

test('with reduced motion the tour is three stills, the building spread apart for the last two', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await open(page);
  await expect(caption(page).getByRole('status')).toHaveText(CAPTION, { timeout: 40000 });
  const first = await camera(page);
  await holds(
    page,
    first,
    async () => (await explode(page).getAttribute('aria-pressed')) === 'true',
  );
  const second = await camera(page);
  expect(second.y).not.toBeCloseTo(first.y, 0);
  await holds(page, second, async () =>
    LAST.test((await caption(page).allTextContents()).join('')),
  );
  await expect(caption(page).getByRole('status')).toHaveText(LAST, { timeout: 6000 });
  const third = await camera(page);
  expect(third.y).not.toBeCloseTo(second.y, 0);
  await expect(caption(page)).toHaveCount(0, { timeout: 8000 });
  await expect(explode(page)).toHaveAttribute('aria-pressed', 'false');
  await context.close();
});

test('a phone in portrait frames the whole building and the caption clears the controls', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await open(page);
  await expect(caption(page)).toBeVisible({ timeout: 40000 });
  const view = await camera(page);
  expect(view.aspect).toBeLessThan(0.7);
  expect(view.radius).toBeCloseTo(ORBIT_RADIUS * portrait(view.aspect), 0);
  const box = (await caption(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844 - 72);
  const rail = (await page.locator('.scene-rail').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(rail.x);
  for (const button of await caption(page).getByRole('button').all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await context.close();
});

for (const theme of ['dark', 'light'] as const)
  test(`${theme} theme: the caption passes axe and announces itself politely`, async ({ page }) => {
    await open(page, theme);
    await expect(caption(page)).toBeVisible({ timeout: 40000 });
    expect(await caption(page).getByRole('status').getAttribute('aria-live')).toBeNull();
    const axe = await new AxeBuilder({ page })
      .include('.intro-caption')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
  });

test('with a repository the closing caption counts its commits and tiers', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await mockGitGraph(page, 40);
  await open(page);
  await expect(caption(page).getByRole('status')).toHaveText('40 個提交 · 4 層', {
    timeout: 40000,
  });
  await context.close();
});
