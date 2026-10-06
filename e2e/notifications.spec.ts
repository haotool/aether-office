import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('notifications are on by default, ask for permission only after a click, and the choice is kept', async ({
  page,
}) => {
  const runtime = JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as {
    directory: string;
  };
  await page.context().grantPermissions(['notifications']);
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime.directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: '進入辦公室', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  // Nothing asks by itself: the first click inside the app is the gesture that does.
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Notification.permission)).toBe('granted');
  const toggle = page.getByRole('checkbox', { name: '通知' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '通知' })).not.toBeChecked(); // persisted choice
});
