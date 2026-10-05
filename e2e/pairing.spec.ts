import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const runtime = () =>
  JSON.parse(readFileSync('.data/e2e-session.json', 'utf8')) as { directory: string };

test('a pairing link that is wrong or used up says so, leaves no code in the address bar and offers the token', async ({
  page,
}) => {
  await page.goto('/#pair=AAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.getByText(/配對碼已失效或已使用過/)).toBeVisible();
  expect(new URL(page.url()).hash).toBe(''); // the code never stays in history
  await expect(page.getByLabel('存取權杖', { exact: true })).toBeVisible();
});

test('the settings page offers a QR code, and says what is missing when the server is not open to the network', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('存取權杖', { exact: true })
    .fill(readFileSync(join(runtime().directory, 'owner-token'), 'utf8').trim());
  await page.getByRole('button', { name: /進入辦公室/ }).click();
  await expect(page.getByRole('link', { name: '設定' })).toBeVisible(); // signed in
  await page.getByRole('link', { name: '設定' }).click();
  await expect(page.getByRole('heading', { name: '連接手機' })).toBeVisible();
  await page.getByRole('button', { name: '產生 QR code' }).click();
  await expect(page.getByText(/目前只允許本機連線/)).toBeVisible(); // the e2e server listens on loopback only
});
