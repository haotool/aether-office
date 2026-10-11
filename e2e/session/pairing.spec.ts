import { devices, expect, test } from '@playwright/test';
import { signIn } from '../support/sign-in.js';
test('a pairing link that is wrong or used up says so, leaves no code in the address bar and offers the token', async ({
  page,
}) => {
  await page.goto('/#pair=AAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.getByText(/配對碼已失效或已使用過/)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByLabel('存取權杖', { exact: true })).toBeVisible();
});

test('a phone scans the link, ends up signed in without a token, and the link works once', async ({
  page,
  browser,
}) => {
  await signIn(page);
  const made = page.waitForResponse(
    (r) => r.url().endsWith('/api/pairings') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '在手機上開啟' }).click();
  await expect(page.getByRole('dialog').getByText(/純 HTTP/)).toBeVisible();
  const { links } = (await (await made).json()) as { links: { origin: string; url: string }[] };
  await expect(page.getByRole('img', { name: links[0]!.origin })).toBeVisible();
  await page.getByLabel('手機連線的位址').selectOption({ index: 1 });
  await expect(page.getByRole('img', { name: links[1]!.origin })).toBeVisible();
  expect(links[0]!.url.split('#pair=')[1]).toBe(links[1]!.url.split('#pair=')[1]);

  const phone = await browser.newContext({ ...devices['Pixel 7'] });
  const phonePage = await phone.newPage();
  await phonePage.goto(links[0]!.url);
  await expect.poll(async () => (await phone.request.get('/api/session')).status()).toBe(200);
  expect(new URL(phonePage.url()).hash).toBe('');
  await expect(phonePage.getByLabel('存取權杖', { exact: true })).toBeHidden();
  await expect(page.getByText('手機已連線')).toBeVisible({ timeout: 10000 });

  const second = await browser.newContext({ ...devices['Pixel 7'] });
  const secondPage = await second.newPage();
  await secondPage.goto(links[1]!.url);
  await expect(secondPage.getByText(/配對碼已失效或已使用過/)).toBeVisible();
  expect((await second.request.get('/api/session')).status()).toBe(401);
  await phone.close();
  await second.close();
});
