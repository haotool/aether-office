import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

test('an owner creates a timezone schedule and sees its next run in that zone', async ({
  page,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await expect(page.getByRole('heading', { name: '排程' })).toBeVisible();
  await page.getByLabel('排程名稱', { exact: true }).fill('每日巡檢');
  await page.getByLabel('時間', { exact: true }).fill('09:00');
  await page.getByLabel('任務標題', { exact: true }).fill('每日巡檢任務');
  await page.getByLabel('驗收條件', { exact: true }).fill('報告已張貼');
  await page.getByRole('button', { name: '建立排程', exact: true }).click();
  const item = page.getByRole('listitem').filter({ hasText: '每日巡檢' });
  await expect(item).toContainText('每日 09:00');
  await expect(item).toContainText('Asia/Taipei');
  await expect(item).toContainText(/上午9:00:00/); // next run rendered in the schedule's own zone
  await item.getByRole('button', { name: '停用' }).click();
  await expect(item.getByRole('button', { name: '啟用' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
