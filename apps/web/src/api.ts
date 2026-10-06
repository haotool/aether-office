import type { Command, Mode } from '@aether/contracts';
import { uuid } from './browser-compat.js';
export type Session = { actor: { id: string; role: string; projectIds: string[] }; mode: Mode };
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
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
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(csrfToken() ? { 'x-csrf-token': csrfToken()! } : {}),
      ...options.headers,
    },
  });
  const body = (await response.json()) as T & { error?: { code?: string } };
  if (!response.ok) throw new ApiError(body.error?.code ?? 'REQUEST_FAILED', response.status);
  return body;
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
