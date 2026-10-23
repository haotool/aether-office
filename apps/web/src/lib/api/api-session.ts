import type { Mode } from '@aether/contracts';
import { api } from './api.js';
import { keepCsrf } from './api-csrf.js';
export type Session = { actor: { id: string; role: string; projectIds: string[] }; mode: Mode };
const LOCAL_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];
export const isLocalHost = (hostname: string) => LOCAL_HOSTS.includes(hostname);
const SIGNED_OUT_KEY = 'aether-signed-out';
export function signedOut(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) !== null;
  } catch {
    return false;
  }
}
export function markSignedOut(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_OUT_KEY, '1');
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    return;
  }
}
export async function login(token: string, remember = false): Promise<Session> {
  const result = await api<Session & { csrf: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ token, remember }),
  });
  keepCsrf(result.csrf, remember);
  markSignedOut(false);
  return result;
}
export async function pair(code: string): Promise<Session> {
  const result = await api<Session & { csrf: string }>('/api/pairings/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  keepCsrf(result.csrf, true);
  markSignedOut(false);
  return result;
}
export async function localSignIn(): Promise<Session | null> {
  const result = await api<(Session & { csrf: string; available: true }) | { available: false }>(
    '/api/login/local',
    { method: 'POST', body: '{}' },
  );
  if (!result.available) return null;
  keepCsrf(result.csrf, true);
  markSignedOut(false);
  return result;
}
