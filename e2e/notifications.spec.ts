import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';

test('notifications are on by default, ask for permission only after a click, and the choice is kept', async ({
  page,
}) => {
  await page.context().grantPermissions(['notifications']);
  await signIn(page);
  await expect(page.locator('.sidebar')).toBeVisible();
  // Nothing asks by itself: the first click inside the app is the gesture that does.
  await page.getByRole('link', { name: '設定', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Notification.permission)).toBe('granted');
  const toggle = page.getByRole('switch', { name: '通知' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('switch', { name: '通知' })).not.toBeChecked(); // persisted choice
});
