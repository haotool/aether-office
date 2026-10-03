import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
test('task DAG shows canonical dependencies, supports keyboard inspection and rejects cyclic edits', async ({
  page,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await page.getByRole('link', { name: /^任務/ }).click();
  for (const [title, dependency] of [
    ['DAG 研究', ''],
    ['DAG 實作', 'DAG 研究'],
    ['DAG 驗證', 'DAG 實作'],
  ]) {
    await page.getByRole('button', { name: '建立任務', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('任務標題', { exact: true }).fill(title!);
    await dialog.getByLabel('驗收條件', { exact: true }).fill('保持前置依賴與版本一致');
    if (dependency)
      await dialog.getByLabel('前置任務', { exact: true }).selectOption({ label: dependency });
    await dialog.getByRole('button', { name: '建立', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page.getByRole('button', { name: '依賴圖', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  const research = page.getByRole('button', { name: /DAG 研究/ });
  await research.focus();
  await research.press('Enter');
  await page.getByLabel('修改前置依賴', { exact: true }).selectOption({ label: 'DAG 驗證' });
  await page.getByRole('button', { name: '儲存依賴', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('DAG_CYCLE');
  await expect(page.getByRole('dialog').getByText('可派工', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('button', { name: /DAG 驗證/ }).click();
  await page.getByLabel('修改前置依賴', { exact: true }).selectOption([]);
  await page.getByRole('button', { name: '儲存依賴', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('可派工', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button', { name: '顯示完整依賴圖', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'evidence/screenshots/e2e-task-dag.png' });
  expect(errors).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: '依賴圖', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button', { name: /DAG 研究/ }).click();
  await expect(
    page.getByText('取消此任務也會取消依賴鏈中尚未開始的後續工作。已執行過的工作不會被覆寫。', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('已取消', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('button', { name: /DAG 驗證/ })).toContainText('可派工');
  await page.getByRole('button', { name: /DAG 實作/ }).click();
  await expect(page.getByRole('dialog').getByText('已取消', { exact: true })).toBeVisible();
  await expect(page.getByText('因前置依賴取消而停止: DAG 研究', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '儲存依賴', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'evidence/screenshots/e2e-dag-cancellation.png' });
});
