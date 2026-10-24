import { test, expect } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

test.use({ storageState: { cookies: [], origins: [] } });

test('orchestration pages are behind Advanced: out of the sidebar and quick open, open by address, back with the switch', async ({
  page,
}) => {
  await signIn(page);
  const sidebar = page.locator('.sidebar');
  for (const name of ['終端機', '本機 Session', '設定'])
    await expect(sidebar.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  for (const name of [
    '任務',
    '成果審查',
    '工具批准',
    '團隊成員',
    '知識庫',
    '訊息',
    '執行主機',
    '外部觀察',
    '歷史紀錄',
    '工作區',
  ])
    await expect(sidebar.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveCount(0);

  await page.keyboard.press('Control+k');
  await page.getByRole('searchbox', { name: '快速開啟' }).fill('任務');
  await expect(page.getByRole('listbox', { name: '快速開啟' }).getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: '任務' })).toBeVisible();

  await page.getByRole('link', { name: '設定', exact: true }).click();
  await expect(page.getByRole('heading', { name: '排程', exact: true })).toHaveCount(0);
  await page.getByRole('switch', { name: '進階功能' }).check();
  await expect(sidebar.getByRole('link', { name: /^任務/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: '進階功能' })).toBeChecked();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the tab bar is the CLI-first set and the running chip has a name and opens the list', async ({
    page,
  }) => {
    await signIn(page);
    const tabs = page.locator('.tabbar');
    for (const name of ['辦公室', 'Session', '終端機', '設定', '更多'])
      await expect(tabs.getByText(name, { exact: true })).toBeVisible();
    await expect(tabs.getByText('任務', { exact: true })).toHaveCount(0);
    const running = page.getByRole('button', { name: /^執行中的 Session: \d+$/ });
    await expect(running).toBeVisible();
    await running.tap();
    await expect(page.getByRole('dialog', { name: '執行中的 Session' })).toBeVisible();
  });
});
