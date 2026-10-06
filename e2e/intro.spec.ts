import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockGitGraph } from './support/git-graph.js';

// The first-visit camera tour. Browser automation never starts it by itself, so every test asks for it with
// `?intro=force`; `?perf=1` leaves the scene's camera on `window.__aetherPerfRig` so the tests can see where it is.
const CAPTION = /歡迎來到辦公室|Welcome to the office/;
const HOME_RADIUS = Math.hypot(30, 44); // the ordinary overview's distance from the building's axis, before the portrait factor
const ORBIT_RADIUS = 84;

async function open(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript((value) => {
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({ state: { theme: value, locale: 'zh-TW', view: '3d' }, version: 0 }),
    );
  }, theme);
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
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
/** The factor a portrait screen stands the camera farther back by. */
const portrait = (aspect: number) => Math.min(2.4, Math.max(1, 1.25 / aspect));
const caption = (page: Page) => page.locator('.intro-caption');
const explode = (page: Page) => page.getByRole('button', { name: '分層展開', exact: true });

test('the tour orbits the building at its radius and height, and Esc lands on the start view', async ({
  page,
}) => {
  await open(page);
  await expect(caption(page).getByRole('status')).toHaveText(CAPTION, { timeout: 40000 });
  const a = await camera(page);
  await page.waitForTimeout(1500);
  const b = await camera(page);
  const k = portrait(b.aspect);
  expect(b.radius).toBeCloseTo(ORBIT_RADIUS * k, 0);
  expect(b.y).toBeCloseTo(38, 1); // a level orbit: the height never changes
  expect(Math.abs(b.bearing - a.bearing)).toBeGreaterThan(0.01); // and it is moving
  await expect(explode(page)).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Escape');
  await expect(caption(page)).toHaveCount(0, { timeout: 5000 });
  await expect(explode(page)).toHaveAttribute('aria-pressed', 'false');
  const end = await camera(page);
  expect(end.radius).toBeCloseTo(HOME_RADIUS * portrait(end.aspect), -1); // the ordinary overview
  expect(await page.evaluate(() => window.sessionStorage.getItem('aether.intro.played'))).toBe('1');
});

test('any input interrupts the tour and leaves the camera exactly where it is', async ({
  page,
}) => {
  await open(page);
  await expect(caption(page)).toBeVisible({ timeout: 40000 });
  await page.waitForTimeout(1200);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(caption(page)).toHaveCount(0);
  const stopped = await camera(page);
  await page.waitForTimeout(900);
  const later = await camera(page);
  for (const key of ['radius', 'y', 'bearing'] as const)
    expect(later[key]).toBeCloseTo(stopped[key], 6); // the controls' own rounding is all that may differ
  expect(stopped.y).toBeCloseTo(38, 1); // still on the orbit, not flung to a start view
  const stored = await page.evaluate(() => window.localStorage.getItem('aether-ui-preferences')!);
  expect(JSON.parse(stored).state.intro ?? 'auto').toBe('auto'); // an interruption is not "don't show again"
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
  await page.waitForTimeout(1200);
  expect(await camera(page)).toEqual(first); // a still does not move
  await expect(explode(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 6000 });
  const second = await camera(page);
  expect(second.y).not.toBeCloseTo(first.y, 0);
  await page.waitForTimeout(1200);
  expect(await camera(page)).toEqual(second);
  await expect(caption(page).getByRole('status')).toHaveText(
    /五層樓，一棟建築|個提交|Five decks|commits/,
    { timeout: 6000 },
  );
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
  expect(view.radius).toBeCloseTo(ORBIT_RADIUS * portrait(view.aspect), 0); // farther back, so the width fits
  const box = (await caption(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844 - 72); // above the session sheet's peek
  const rail = (await page.locator('.scene-rail').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(rail.x); // clear of the floor rail
  for (const button of await caption(page).getByRole('button').all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await context.close();
});

for (const theme of ['dark', 'light'] as const)
  test(`${theme} theme: the caption passes axe and announces itself politely`, async ({ page }) => {
    await open(page, theme);
    await expect(caption(page)).toBeVisible({ timeout: 40000 });
    expect(await caption(page).getByRole('status').getAttribute('aria-live')).toBeNull(); // role=status is polite by itself
    const axe = await new AxeBuilder({ page })
      .include('.intro-caption')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
  });

test('with a repository the closing caption counts its commits and tiers', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await mockGitGraph(page, 40); // 40 commits make 4 tiers of 12
  await open(page);
  await expect(caption(page).getByRole('status')).toHaveText('40 個提交 · 4 層', {
    timeout: 40000,
  });
  await context.close();
});
