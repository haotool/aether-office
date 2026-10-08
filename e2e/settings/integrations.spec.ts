import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

test('an owner connects GitHub by naming the credential variable, and a missing token is reported honestly', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await page.getByLabel('GitHub 擁有者', { exact: true }).fill('acme');
  await page.getByLabel('儲存庫', { exact: true }).fill('app');
  await page.getByLabel('憑證環境變數名稱', { exact: true }).fill('AETHER_E2E_UNSET_TOKEN');
  await page.getByRole('button', { name: '連接', exact: true }).click();
  const item = page.getByRole('listitem').filter({ hasText: 'acme/app' });
  await expect(item).toContainText('AETHER_E2E_UNSET_TOKEN');
  await item.getByRole('button', { name: '立即同步' }).click();
  await expect(item.getByRole('alert')).toContainText('INTEGRATION_TOKEN_MISSING');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
