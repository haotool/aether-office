import { ApiError } from './api-error.js';
import { csrfToken, refreshCsrf } from './api-csrf.js';
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
