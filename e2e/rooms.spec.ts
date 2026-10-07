import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

test('an operator creates a room and posts to it without choosing recipients', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /^訊息/ }).click();
  await page.getByLabel('房間名稱', { exact: true }).fill('工程房');
  await page
    .getByLabel('成員', { exact: true })
    .selectOption([{ label: 'Mika' }, { label: 'Nova' }]);
  await page.getByRole('button', { name: '建立房間', exact: true }).click();
  const item = page.getByRole('listitem').filter({ hasText: '工程房' });
  await expect(item).toContainText('Mika');
  await expect(item).toContainText('Nova');

  await page.getByLabel('房間', { exact: true }).selectOption({ label: '工程房' });
  await expect(page.getByLabel('收件成員', { exact: true })).toBeDisabled();
  await page.getByLabel('訊息內容', { exact: true }).fill('房間內的第一則訊息');
  await page.getByRole('button', { name: '傳送', exact: true }).click();
  await expect(page.getByText('房間內的第一則訊息')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
