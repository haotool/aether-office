import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('browser notifications are off by default and only enable after an explicit permission grant', async ({
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
  await page.getByRole('link', { name: '工具批准', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: /瀏覽器通知/ });
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => Notification.permission)).toBe('default'); // nothing asked on its own
  await page.context().grantPermissions(['notifications']);
  await toggle.click(); // state flips after the async permission request
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => Notification.permission)).toBe('granted');
  await page.reload();
  await page.getByRole('link', { name: '工具批准', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /瀏覽器通知/ })).toBeChecked(); // persisted choice
});
