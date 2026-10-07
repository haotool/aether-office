import { test, expect } from '@playwright/test';
import { signIn } from './support/sign-in.js';

// What a person does from a phone, with taps and not clicks: sign in, write a prompt as a task, hand it to a member,
// send a message, look at a member, go to another page through the drawer, sign out. Runs in Chrome with a phone's
// screen and touch; with AETHER_WEBKIT=1 (and `playwright install webkit`) it also runs in WebKit, the engine of iOS.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('from a phone: sign in, give a member a task, message a member, and sign out', async ({
  page,
}) => {
  test.setTimeout(120000);
  const tab = async (name: RegExp) => page.locator('.tabbar').getByRole('link', { name }).tap();
  const drawer = async () => page.getByRole('button', { name: '更多', exact: true }).tap();
  await signIn(page, '/', { tap: true });
  await expect(page.locator('.phone-office')).toBeVisible(); // the phone office has no heading: the scene is the page

  const title = `手機派工 ${Date.now()}`;
  await page.getByRole('button', { name: '建立任務', exact: true }).tap();
  await page.getByLabel('任務標題', { exact: true }).fill(title);
  await page
    .getByLabel('工作說明', { exact: true })
    .fill('從手機下的 prompt：請列出本週要做的事。');
  await page.getByLabel('驗收條件', { exact: true }).fill('清單至少三項。');
  await page.getByRole('button', { name: '建立', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await tab(/^任務/);
  await page.getByRole('button', { name: new RegExp(title) }).tap();
  await page.getByLabel('選擇成員', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: '派工', exact: true }).tap();
  await expect(page.getByRole('dialog').getByText('待審查', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).tap();

  await tab(/^訊息/);
  const text = `手機訊息 ${Date.now()}`;
  await page.getByLabel('收件成員', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('訊息內容', { exact: true }).fill(text);
  await page.getByRole('button', { name: '傳送', exact: true }).tap();
  await expect(page.getByText(text, { exact: true })).toBeVisible();

  await tab(/^辦公室/);
  await page.getByRole('button', { name: '2D', exact: true }).tap();
  await page.locator('.agent-card').first().tap();
  await expect(page.locator('.member-bar')).toBeVisible();
  await page.getByRole('button', { name: '開啟對話', exact: true }).tap();
  await expect(page.locator('.session-sheet.full')).toBeVisible();
  await page.locator('.session-sheet').getByRole('button', { name: '收合', exact: true }).tap();

  await drawer();
  await page.getByRole('button', { name: '登出', exact: true }).tap();
  await expect(page.getByLabel('存取權杖', { exact: true })).toBeVisible();
});
