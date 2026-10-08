import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';

// The browser's API client against a fake `fetch`: what it sends (credentials, CSRF token, content type), how it recovers
// when another tab rotated the token, and where it keeps the token.
const env = installBrowserEnv();
const { api } = await import('../../apps/web/src/api.js');
const { ApiError } = await import('../../apps/web/src/api-error.js');
const { ensureCsrf, forgetCsrf, refreshCsrf } = await import('../../apps/web/src/api-csrf.js');
const { execute } = await import('../../apps/web/src/api-commands.js');
const { login, pair } = await import('../../apps/web/src/api-session.js');
afterAll(removeBrowserEnv);

type Sent = { url: string; init: RequestInit & { headers: Record<string, string> } };
let sent: Sent[];
let replies: (() => Response)[];
const reply = (body: unknown, status = 200) => replies.push(() => Response.json(body, { status }));
const session = () => (globalThis as unknown as { sessionStorage: Storage }).sessionStorage;

beforeEach(() => {
  sent = [];
  replies = [];
  env.storage.clear();
  session().clear();
  installGlobal('fetch', (url: string, init: Sent['init']) => {
    sent.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return Promise.resolve(next());
  });
});
const headers = (i = 0) => sent[i]!.init.headers;

describe('api', () => {
  it('sends JSON with the session cookie and returns the body', async () => {
    reply({ ok: 1 });
    await expect(api('/api/x')).resolves.toEqual({ ok: 1 });
    expect(sent[0]!.init.credentials).toBe('same-origin');
    expect(headers()['content-type']).toBe('application/json');
    expect(headers()).not.toHaveProperty('x-csrf-token');
  });

  it('adds the CSRF token of the tab, or of the remembered device when the tab has none', async () => {
    session().setItem('aether-csrf', 'tab-token');
    reply({});
    await api('/api/x');
    expect(headers()['x-csrf-token']).toBe('tab-token');
    session().clear();
    env.storage.setItem('aether-csrf', 'device-token');
    reply({});
    await api('/api/x');
    expect(headers(1)['x-csrf-token']).toBe('device-token');
  });

  it('lets the caller override the method, body and headers', async () => {
    reply({});
    await api('/api/x', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } });
    expect(sent[0]!.init.method).toBe('POST');
    expect(headers()['content-type']).toBe('text/plain');
  });

  it('throws an ApiError carrying the server’s code and status, with words for a person', async () => {
    reply({ error: { code: 'FORBIDDEN' } }, 403);
    const error = await api('/api/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect((error as Error).message).not.toBe('FORBIDDEN');
    reply({ error: { code: 'SOMETHING_NEW' } }, 500);
    expect(((await api('/api/x').catch((e: unknown) => e)) as Error).message).toBe('SOMETHING_NEW');
  });

  it('calls an error without a code REQUEST_FAILED', async () => {
    reply({}, 502);
    await expect(api('/api/x')).rejects.toMatchObject({ code: 'REQUEST_FAILED', status: 502 });
  });

  it('passes a network failure through as it is, for the caller to tell from a refusal', async () => {
    installGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(api('/api/x')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('CSRF recovery', () => {
  it('asks for a new token and sends the write once more when only the token was refused', async () => {
    session().setItem('aether-csrf', 'old');
    reply({ error: { code: 'CSRF_REQUIRED' } }, 403);
    reply({ csrf: 'fresh', expiresAt: Date.now() + 1000 });
    reply({ done: true });
    await expect(api('/api/x', { method: 'POST', body: '{"a":1}' })).resolves.toEqual({
      done: true,
    });
    expect(sent.map((s) => s.url)).toEqual(['/api/x', '/api/session/csrf', '/api/x']);
    expect(headers(2)['x-csrf-token']).toBe('fresh');
    expect(sent[2]!.init.body).toBe('{"a":1}'); // the same body, so the same idempotency key
  });

  it('gives up after one retry', async () => {
    reply({ error: { code: 'CSRF_REQUIRED' } }, 403);
    reply({ csrf: 'fresh', expiresAt: Date.now() + 1000 });
    reply({ error: { code: 'CSRF_REQUIRED' } }, 403);
    await expect(api('/api/x', { method: 'POST' })).rejects.toMatchObject({
      code: 'CSRF_REQUIRED',
    });
    expect(sent).toHaveLength(3);
  });

  it('does not ask for another token when another tab already brought one', async () => {
    session().setItem('aether-csrf', 'old');
    replies.push(() => {
      session().setItem('aether-csrf', 'from-another-tab');
      return Response.json({ error: { code: 'CSRF_REQUIRED' } }, { status: 403 });
    });
    reply({ done: true });
    await api('/api/x', { method: 'POST' });
    expect(sent.map((s) => s.url)).toEqual(['/api/x', '/api/x']);
    expect(headers(1)['x-csrf-token']).toBe('from-another-tab');
  });

  it('shares one rotation among simultaneous callers', async () => {
    reply({ csrf: 'once', expiresAt: Date.now() + 1000 });
    await Promise.all([refreshCsrf(), refreshCsrf(), refreshCsrf()]);
    expect(sent).toHaveLength(1);
    expect(session().getItem('aether-csrf')).toBe('once');
  });

  it('fetches a token only when the page has none', async () => {
    reply({ csrf: 'new', expiresAt: Date.now() + 1000 });
    await ensureCsrf();
    await ensureCsrf();
    expect(sent).toHaveLength(1);
  });

  it('keeps a long-lived token for the device and a short one for the tab', async () => {
    reply({ csrf: 'short', expiresAt: Date.now() + 8 * 3_600_000 });
    await refreshCsrf();
    expect(env.storage.getItem('aether-csrf')).toBeNull();
    reply({ csrf: 'long', expiresAt: Date.now() + 30 * 24 * 3_600_000 });
    await refreshCsrf();
    expect(env.storage.getItem('aether-csrf')).toBe('long');
    expect(session().getItem('aether-csrf')).toBe('long');
  });

  it('reports a refused rotation', async () => {
    reply({ error: { code: 'AUTH_REQUIRED' } }, 401);
    await expect(refreshCsrf()).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  });

  it('forgets the token everywhere', () => {
    session().setItem('aether-csrf', 'a');
    env.storage.setItem('aether-csrf', 'b');
    forgetCsrf();
    expect(session().getItem('aether-csrf')).toBeNull();
    expect(env.storage.getItem('aether-csrf')).toBeNull();
  });
});

describe('signing in', () => {
  const signedIn = { actor: { id: 'u', role: 'owner', projectIds: [] }, mode: 'live', csrf: 'tok' };

  it('keeps the token for the tab only, unless the person asked to be remembered', async () => {
    reply(signedIn);
    await login('secret');
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual({ token: 'secret', remember: false });
    expect(session().getItem('aether-csrf')).toBe('tok');
    expect(env.storage.getItem('aether-csrf')).toBeNull();
    reply(signedIn);
    await login('secret', true);
    expect(env.storage.getItem('aether-csrf')).toBe('tok');
  });

  it('remembers a phone paired with a code', async () => {
    reply(signedIn);
    await pair('abc123');
    expect(sent[0]!.url).toBe('/api/pairings/redeem');
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual({ code: 'abc123' });
    expect(env.storage.getItem('aether-csrf')).toBe('tok');
  });

  it('does not keep a token when the sign-in is refused', async () => {
    reply({ error: { code: 'LOGIN_RATE_LIMIT' } }, 429);
    await expect(login('x')).rejects.toMatchObject({ code: 'LOGIN_RATE_LIMIT' });
    expect(session().getItem('aether-csrf')).toBeNull();
  });
});

describe('execute', () => {
  it('wraps a command with fresh idempotency and correlation keys and the optional project and version', async () => {
    reply({ status: 'persisted', result: {} });
    reply({ status: 'persisted', result: {} });
    await execute('work.cancel', { workId: 'w' }, 'p1', 3);
    await execute('work.cancel', { workId: 'w' });
    const [first, second] = sent.map(
      (s) => JSON.parse(s.init.body as string) as Record<string, unknown>,
    );
    expect(first).toMatchObject({
      schemaVersion: 1,
      type: 'work.cancel',
      data: { workId: 'w' },
      projectId: 'p1',
      expectedVersion: 3,
    });
    expect(second).not.toHaveProperty('projectId');
    expect(second).not.toHaveProperty('expectedVersion');
    expect(first!['idempotencyKey']).not.toBe(second!['idempotencyKey']);
    expect(first!['correlationId']).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[0]!.url).toBe('/api/commands');
    expect(sent[0]!.init.method).toBe('POST');
  });

  it('can send expectedVersion zero', async () => {
    reply({ status: 'persisted', result: {} });
    await execute('layout.save', {}, 'p', 0);
    expect(JSON.parse(sent[0]!.init.body as string)).toHaveProperty('expectedVersion', 0);
  });
});
