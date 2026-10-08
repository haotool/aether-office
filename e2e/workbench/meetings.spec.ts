import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
import AxeBuilder from '@axe-core/playwright';

test('a bounded meeting is started, shows its budget, and concludes into a pending knowledge proposal', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: /^訊息/ }).click();
  await page.getByLabel('主題', { exact: true }).fill('選擇佇列');
  await page.getByLabel('要成員回答的問題', { exact: true }).fill('Redis 還是 SQS？');
  await page
    .getByLabel('參與成員（至少兩位）', { exact: true })
    .selectOption([{ label: 'Mika' }, { label: 'Sora' }]);
  await page.getByRole('button', { name: '開始會議', exact: true }).click();
  const item = page.getByRole('listitem').filter({ hasText: '選擇佇列' });
  await expect(item).toContainText('1/6');
  await item.getByLabel('決議', { exact: true }).fill('採用 SQS');
  await item.getByRole('button', { name: '結案並提出知識提案' }).click();
  await expect(item).toContainText('已結案');
  await page.getByRole('link', { name: '知識庫', exact: true }).click();
  await expect(page.getByText('Meeting decision: 選擇佇列')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
