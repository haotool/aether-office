import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

test('starting a frontend/backend workflow creates parallel tasks and a dependent integration step', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: /^任務/ }).click();
  await page.getByRole('button', { name: '從模板啟動工作流程', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('工作流程模板', { exact: true }).selectOption('frontend_backend');
  await dialog.getByLabel('任務標題', { exact: true }).fill('結帳頁改版');
  await dialog.getByLabel('驗收條件', { exact: true }).fill('前後端整合後可下單');
  await dialog.getByRole('button', { name: '建立工作流程', exact: true }).click();
  await expect(page.getByRole('button', { name: /結帳頁改版 · Frontend/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /結帳頁改版 · Backend/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /結帳頁改版 · Integration review/ })).toContainText(
    '等待前置',
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
