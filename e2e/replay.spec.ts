import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';

test('replay is a clearly labelled read-only view that can return to LIVE', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: '歷史紀錄', exact: true }).click();
  await page.getByLabel(/回放到 seq/).fill('1');
  await page.getByRole('button', { name: '開始回放', exact: true }).click();
  const banner = page.getByRole('status').filter({ hasText: 'REPLAY' });
  await expect(banner).toContainText('唯讀事件回放');
  await expect(banner).toContainText('seq ≤ 1');
  await expect(page.getByRole('button', { name: '建立任務' })).toHaveCount(0);
  await banner.getByRole('button', { name: '返回 LIVE' }).click();
  await expect(page.getByLabel(/回放到 seq/)).toBeVisible();
});
