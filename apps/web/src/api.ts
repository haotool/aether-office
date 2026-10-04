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
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(sessionStorage.getItem('aether-csrf')
        ? { 'x-csrf-token': sessionStorage.getItem('aether-csrf')! }
        : {}),
      ...options.headers,
    },
  });
  const body = (await response.json()) as T & { error?: { code?: string } };
  if (!response.ok) throw new ApiError(body.error?.code ?? 'REQUEST_FAILED', response.status);
  return body;
}
export async function login(token: string): Promise<Session> {
  const result = await api<Session & { csrf: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  sessionStorage.setItem('aether-csrf', result.csrf);
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
