import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } }); // a new user: Advanced is off

test('the office offers task and layout editing only with Advanced on', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('button', { name: '重設視角' })).toBeVisible(); // the office is up
  await expect(page.getByRole('button', { name: '建立任務' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '編輯配置（實驗性）', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await page.getByRole('switch', { name: '進階功能' }).check();
  await page.getByRole('link', { name: '辦公室', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '建立任務' })).toBeVisible();
  await expect(page.getByRole('button', { name: '編輯配置（實驗性）', exact: true })).toBeVisible();
});

test('the top bar says the link is live, offline when the network goes, and live again when it returns', async ({
  page,
  context,
}) => {
  await signIn(page);
  const status = page.locator('.link-status');
  await expect(status).toContainText('即時');
  await context.setOffline(true);
  await expect(status).toContainText('離線');
  await context.setOffline(false);
  await expect(status).toContainText('即時');
});
