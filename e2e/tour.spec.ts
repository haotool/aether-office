import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the camera tour can be paused, skipped, stopped and interrupted by dragging the camera', async ({
  page,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
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
