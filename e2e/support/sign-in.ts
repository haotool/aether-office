import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_FIELD = /^(存取權杖|Access token)$/;
const ENTER = /^(進入辦公室|Enter office)$/;
const REMEMBER = /^(記住這台裝置 30 天|Remember this device for 30 days)$/;

export const NATIVE_SESSION = '.data/e2e-native-session.json';
/** The native server's address, as its launcher wrote it (the port is the launcher's to choose, never a spec's). */
export const nativeOrigin = () =>
  `http://127.0.0.1:${(JSON.parse(readFileSync(NATIVE_SESSION, 'utf8')) as { port: number }).port}`;

type Options = {
  session?: string;
  tap?: boolean;
  /** The form ticks "remember this device" by default; false clears the box first. */
  remember?: boolean;
};

/**
 * Returns once the login has answered (the token field is gone): leaving the page earlier drops the CSRF token the page
 * keeps from that answer, and the page's own writes are refused.
 */
export async function signIn(
  page: Page,
  path = '/',
  { session = '.data/e2e-session.json', tap = false, remember = true }: Options = {},
) {
  const { directory } = JSON.parse(readFileSync(session, 'utf8')) as { directory: string };
  await page.goto(path);
  await page
    .getByLabel(TOKEN_FIELD)
    .fill(readFileSync(join(directory, 'owner-token'), 'utf8').trim());
  if (!remember) await page.getByRole('checkbox', { name: REMEMBER }).uncheck();
  const enter = page.getByRole('button', { name: ENTER });
  await (tap ? enter.tap() : enter.click());
  await expect(page.getByLabel(TOKEN_FIELD)).toBeHidden();
}
