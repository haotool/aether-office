import { ApiError } from './api-error.js';
const CSRF_KEY = 'aether-csrf';
/** The CSRF token of this session: in the tab's storage, or (a remembered device) in the browser's. */
export function csrfToken(): string | null {
  try {
    return sessionStorage.getItem(CSRF_KEY) ?? localStorage.getItem(CSRF_KEY);
  } catch {
    return sessionStorage.getItem(CSRF_KEY);
  }
}
/** Keeps the token for as long as the session lasts: for a tab, or for a device the person chose to remember. */
export function keepCsrf(csrf: string, remember: boolean) {
  sessionStorage.setItem(CSRF_KEY, csrf);
  try {
    if (remember) localStorage.setItem(CSRF_KEY, csrf);
    else localStorage.removeItem(CSRF_KEY);
  } catch {
    /* private mode: the tab's copy is enough */
  }
}
export function forgetCsrf() {
  sessionStorage.removeItem(CSRF_KEY);
  try {
    localStorage.removeItem(CSRF_KEY);
  } catch {
    /* nothing to forget */
  }
}
/** A session that lasts longer than this was remembered on purpose (a sign-in lasts 8 hours, a remembered device 30 days). */
const REMEMBERED_AFTER_MS = 12 * 60 * 60 * 1000;
// Tabs of one browser share a session cookie but not a tab's storage: a token one of them gets is handed to the others.
const tabs = typeof window === 'undefined' ? null : new BroadcastChannel('aether-csrf');
tabs?.addEventListener('message', ({ data }) => {
  if (typeof data === 'string' && csrfToken()) keepCsrf(data, hasRememberedCsrf());
});
function hasRememberedCsrf() {
  try {
    return localStorage.getItem(CSRF_KEY) !== null;
  } catch {
    return false;
  }
}

let rotation: Promise<void> | null = null;
/**
 * The page is signed in (the session cookie answers) but holds no CSRF token: a closed or discarded tab took it along.
 * The cookie alone asks for a new one, which replaces the old on the server. One request at a time, for every caller.
 */
export function refreshCsrf(): Promise<void> {
  rotation ??= fetch('/api/session/csrf', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
    .then(async (response) => {
      const body = (await response.json()) as { csrf: string; expiresAt: number } & {
        error?: { code?: string };
      };
      if (!response.ok) throw new ApiError(body.error?.code ?? 'REQUEST_FAILED', response.status);
      keepCsrf(body.csrf, hasRememberedCsrf() || body.expiresAt - Date.now() > REMEMBERED_AFTER_MS);
      tabs?.postMessage(body.csrf);
    })
    .finally(() => {
      rotation = null;
    });
  return rotation;
}
/** After `/api/session` has answered: gets a token when the page has none. */
export async function ensureCsrf() {
  if (!csrfToken()) await refreshCsrf();
}
