import { test, expect } from '@playwright/test';
import { frames } from '../support/settled.js';
import type { PerfRig } from '../../packages/office-scene/src/perf/perf-rig.js';
import { signIn } from '../support/sign-in.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a fresh phone defaults to automatic framing, respects reduced motion and resumes after touch', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({ state: { view: '3d', locale: 'zh-TW' }, version: 0 }),
    );
  });
  await signIn(page, '/office?perf=1', { tap: true });
  const caption = page.locator('.shot-caption');
  await expect(caption).toBeVisible({ timeout: 20000 });
  const auto = page.getByRole('button', { name: '自動鏡頭' });
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction(
    () => !!(window as unknown as { __aetherPerfRig?: unknown }).__aetherPerfRig,
  );
  const position = () =>
    page.evaluate(async () => {
      const rig = (window as unknown as { __aetherPerfRig: PerfRig }).__aetherPerfRig;
      await rig.sample(2);
      return rig.camera.position.toArray();
    });
  const before = await position();
  await frames(page, 20);
  expect(await position()).toEqual(before);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const canvas = page.locator('canvas');
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(400);
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 330, { steps: 4 });
  await page.mouse.up();
  await expect(caption).toBeHidden({ timeout: 5000 });
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  await auto.tap();
  await expect(caption).toBeVisible({ timeout: 2000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const resumed = await position();
  await frames(page, 20);
  expect(await position()).toEqual(resumed);
  await auto.tap();
  await expect(caption).toBeHidden();
});
