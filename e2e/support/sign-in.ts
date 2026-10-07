import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_FIELD = /^(存取權杖|Access token)$/;
const ENTER = /^(進入辦公室|Enter office)$/;

export const NATIVE_SESSION = '.data/e2e-native-session.json';
/** The native server's address, as its launcher wrote it (the port is the launcher's to choose, never a spec's). */
export const nativeOrigin = () =>
  `http://127.0.0.1:${(JSON.parse(readFileSync(NATIVE_SESSION, 'utf8')) as { port: number }).port}`;

type Options = {
  /** The session file of the server to sign in to (the native server writes `.data/e2e-native-session.json`). */
  session?: string;
  /** Press the button with a touch tap instead of a click. */
  tap?: boolean;
};

/**
 * Opens `path` and signs in with the owner token. It returns once the login has answered (the token field is gone):
 * leaving the page earlier drops the CSRF token the page keeps from that answer, and the page's own writes are refused.
 */
export async function signIn(
  page: Page,
  path = '/',
  { session = '.data/e2e-session.json', tap = false }: Options = {},
) {
  const { directory } = JSON.parse(readFileSync(session, 'utf8')) as { directory: string };
  await page.goto(path);
  await page
    .getByLabel(TOKEN_FIELD)
    .fill(readFileSync(join(directory, 'owner-token'), 'utf8').trim());
  const enter = page.getByRole('button', { name: ENTER });
  await (tap ? enter.tap() : enter.click());
  await expect(page.getByLabel(TOKEN_FIELD)).toBeHidden();
}
