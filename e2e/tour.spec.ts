import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';

test('the camera tour can be paused, skipped, stopped and interrupted by dragging the camera', async ({
  page,
}) => {
  await signIn(page);
  const start = page.getByRole('button', { name: '房間導覽', exact: true });
  await start.click();
  await expect(page.getByRole('button', { name: '暫停導覽', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暫停導覽', exact: true }).click();
  await expect(page.getByRole('button', { name: '繼續導覽', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '跳到下一站', exact: true }).click();
  await expect(page.getByRole('button', { name: '繼續導覽', exact: true })).toBeVisible(); // still paused
  await page.getByRole('button', { name: '結束導覽', exact: true }).click();
  await expect(start).toBeVisible();

  await start.click();
  await expect(page.getByRole('button', { name: '結束導覽', exact: true })).toBeVisible();
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect(start).toBeVisible(); // user input interrupted the tour
});
