import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('the director frames a shot, yields to a touch and comes back', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({ state: { autoCamera: true, view: '3d', locale: 'zh-TW' }, version: 0 }),
    ),
  );
  await signIn(page, '/', { tap: true });
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  const caption = page.locator('.shot-caption');
  await expect(caption).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: '自動鏡頭' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const canvas = page.locator('canvas');
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(400);
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 330, { steps: 4 });
  await page.mouse.up();
  await expect(caption).toBeHidden({ timeout: 5000 });
  await expect(caption).toBeVisible({ timeout: 25000 });
  await page.getByRole('button', { name: '自動鏡頭' }).tap();
  await expect(caption).toBeHidden();
});
