import type { Command, Mode } from '@aether/contracts';
import { uuid } from './browser-compat.js';
import { errorText, savedLocale } from './error-text.js';
export type Session = { actor: { id: string; role: string; projectIds: string[] }; mode: Mode };
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(errorText(code, savedLocale())); // the message is for a person; `code` is for the code
  }
}
const CSRF_KEY = 'aether-csrf';
/** The CSRF token of this session: in the tab's storage, or (a remembered device) in the browser's. */
function csrfToken(): string | null {
  try {
    return sessionStorage.getItem(CSRF_KEY) ?? localStorage.getItem(CSRF_KEY);
  } catch {
    return sessionStorage.getItem(CSRF_KEY);
  }
}
/** Keeps the token for as long as the session lasts: for a tab, or for a device the person chose to remember. */
function keepCsrf(csrf: string, remember: boolean) {
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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  // A write refused for its CSRF token while the session is fine (another tab rotated it) is sent once more with a new
  // one. The body, and so the command's idempotency key, is the same, and a refused request had no effect.
  for (let retry = true; ; retry = false) {
    const sent = csrfToken();
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(sent ? { 'x-csrf-token': sent } : {}),
        ...options.headers,
      },
    });
    const body = (await response.json()) as T & { error?: { code?: string } };
    if (response.ok) return body;
    if (retry && response.status === 403 && body.error?.code === 'CSRF_REQUIRED') {
      if (csrfToken() === sent) await refreshCsrf(); // else another tab has already brought a new one
      continue;
    }
    throw new ApiError(body.error?.code ?? 'REQUEST_FAILED', response.status);
  }
}
export async function login(token: string, remember = false): Promise<Session> {
  const result = await api<Session & { csrf: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ token, remember }),
  });
  keepCsrf(result.csrf, remember);
  return result;
}
/** Signs a phone in with the code from a pairing QR code; the device is remembered (see services/pairing.ts). */
export async function pair(code: string): Promise<Session> {
  const result = await api<Session & { csrf: string }>('/api/pairings/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  keepCsrf(result.csrf, true);
  return result;
}
export async function execute(
  type: Command['type'],
  data: unknown,
  projectId?: string,
  expectedVersion?: number,
) {
  return api<{ status: 'persisted'; result: Record<string, unknown> }>('/api/commands', {
    method: 'POST',
    body: JSON.stringify({
      schemaVersion: 1,
      type,
      data,
      idempotencyKey: uuid(),
      correlationId: uuid(),
      ...(projectId ? { projectId } : {}),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    }),
  });
}
