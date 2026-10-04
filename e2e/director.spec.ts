import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The camera runs itself: it names what it is on, hands over at a touch, and takes the camera back after a quiet spell.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('the director frames a shot, yields to a touch and comes back', async ({ page }) => {
  test.setTimeout(120000);
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({ state: { autoCamera: true, view: '3d', locale: 'zh-TW' }, version: 0 }),
    ),
  );
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).tap();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  const caption = page.locator('.shot-caption');
  await expect(caption).toBeVisible({ timeout: 20000 }); // a sweep of the floor when nothing is going on
  await expect(page.getByRole('button', { name: '自動鏡頭' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A touch of the camera hands it to the person; the caption goes with the shot.
  const box = (await page.locator('canvas').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 330, { steps: 4 });
  await page.mouse.up();
  await expect(caption).toBeHidden({ timeout: 5000 });
  // After a quiet spell (ten seconds on a phone) it takes over again.
  await expect(caption).toBeVisible({ timeout: 25000 });
  // And it can be switched off.
  await page.getByRole('button', { name: '自動鏡頭' }).tap();
  await expect(caption).toBeHidden();
});
