import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';
test('knowledge proposals retain provenance and require explicit human approve or reject', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await page.getByRole('link', { name: '知識庫', exact: true }).click();
  for (const [title, button, state] of [
    ['知識核准測試', '批准知識提案', '人類已批准'],
    ['知識駁回測試', '駁回知識提案', '已駁回'],
  ]) {
    await page.getByRole('button', { name: '新增知識提案', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('名稱', { exact: true }).fill(title!);
    await dialog.getByLabel('內容', { exact: true }).fill('這是合成知識提案；批准不代表測試證實。');
    await dialog.getByLabel('來源', { exact: true }).fill('fixture://knowledge-e2e');
    await dialog.getByText('工作／產物／Commit 引用', { exact: true }).click();
    await dialog.getByLabel('Commit 引用（未驗證）', { exact: true }).fill('a'.repeat(40));
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: title!, exact: true }) });
    await expect(card.getByText('待確認提案', { exact: true })).toBeVisible();
    await card
      .getByLabel('知識審核說明', { exact: true })
      .fill('已人工檢閱 fixture 引用，保留測試證據邊界。');
    await card.getByRole('button', { name: button!, exact: true }).click();
    await expect(card.getByText(state!, { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: '批准知識提案', exact: true })).toHaveCount(0);
    await card.getByText('工作／產物／Commit 引用', { exact: true }).click();
    await expect(card.getByText('a'.repeat(40), { exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByText('人類已批准', { exact: true })).toBeVisible();
  await expect(page.getByText('已駁回', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'evidence/screenshots/e2e-knowledge-review.png' });
  expect(errors).toEqual([]);
});
