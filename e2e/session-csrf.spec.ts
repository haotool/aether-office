import { expect, test, type Page } from '@playwright/test';
import { signIn as signInTo } from './support/sign-in.js';

const signIn = async (page: Page) => {
  await signInTo(page);
  await expect(page.getByRole('button', { name: '在手機上開啟' })).toBeVisible();
};

/** A write the person makes from the top bar of every page: a cookie session plus a CSRF token. */
const writeFromPage = async (page: Page) => {
  const made = page.waitForResponse(
    (r) => r.url().endsWith('/api/pairings') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '在手機上開啟' }).click();
  return (await made).status();
};

// A closed tab (or one iOS discarded) takes its sessionStorage with it; the cookie lives on for hours.
test('a signed-in browser that lost its tab can still write: the page asks for a new CSRF token', async ({
  context,
  page,
}) => {
  await signIn(page);
  expect(await writeFromPage(page)).toBe(200);
  await page.close();

  const back = await context.newPage();
  await back.goto('/');
  await expect(back.getByRole('button', { name: '在手機上開啟' })).toBeVisible(); // looks signed in
  expect(await writeFromPage(back)).toBe(200);
  // not kept beyond the tab: a sign-in that was not remembered stays in sessionStorage
  expect(await back.evaluate(() => localStorage.getItem('aether-csrf'))).toBeNull();
});

test('a second tab rotates the token and the first keeps working (the old token is refused once, then retried)', async ({
  context,
  page,
}) => {
  await signIn(page);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('button', { name: '在手機上開啟' })).toBeVisible();
  expect(await writeFromPage(second)).toBe(200);
  expect(await writeFromPage(page)).toBe(200);
});
