import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

test('an owner creates a one-time machine invitation that is shown once and never stored in the page', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: '執行主機', exact: true }).click();
  await page.getByLabel('主機名稱', { exact: true }).fill('遠端測試機');
  await page.getByLabel('允許的工作根目錄（絕對路徑）', { exact: true }).fill('/srv/aether');
  await page.getByRole('button', { name: '產生邀請', exact: true }).click();
  const shown = page.getByRole('status').filter({ hasText: '只顯示這一次' });
  await expect(shown).toContainText('AETHER_INVITATION=inv_');
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('inv_');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.reload();
  await page.getByRole('link', { name: '執行主機', exact: true }).click();
  await expect(page.getByText('AETHER_INVITATION=inv_')).toHaveCount(0);
});
