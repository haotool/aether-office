import type { Mode } from '@aether/contracts';
import { api } from './api.js';
import { keepCsrf } from './api-csrf.js';
export type Session = { actor: { id: string; role: string; projectIds: string[] }; mode: Mode };
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
