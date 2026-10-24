import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

test('lite lists conversations and opens one without the office shell', async ({ page }) => {
  await signIn(page, '/lite');
  const row = page.locator('.lite-row').first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.app-body')).toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(/[?&]s=/);
  await page.getByRole('button', { name: /^(返回清單|Back to list)$/ }).click();
  await expect(page.locator('.lite-row').first()).toBeVisible();
});
