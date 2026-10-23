import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { fixture } from './fixture.js';

const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});

const ORIGIN = 'http://127.0.0.1:8780';
const HERE = { host: '127.0.0.1:8780', origin: ORIGIN };

function setup(options: { localSignIn?: boolean; trustProxy?: string } = {}) {
  const f = fixture();
  clean.push(() => f.control.close());
  const app = createServer(f.control, { origin: ORIGIN, localSignIn: true, ...options });
  clean.push(() => app.close());
  return { ...f, app };
}

const ask = (
  f: ReturnType<typeof setup>,
  headers: Record<string, string> = HERE,
  remoteAddress = '127.0.0.1',
) => f.app.inject({ method: 'POST', url: '/api/login/local', headers, remoteAddress });

describe('signing in on this machine without the token', () => {
  it('opens a month-long owner session for the browser that asks from loopback', async () => {
    const f = setup();
    const res = await ask(f);
    const body = res.json() as { available: boolean; csrf: string; actor: { role: string } };
    expect(body).toMatchObject({ available: true, actor: { role: 'owner' } });
    expect(String(res.headers['set-cookie'])).toMatch(/Max-Age=2592000/);
    const cookie = String(res.headers['set-cookie']).split(';')[0]!;
    const session = await f.app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { ...HERE, cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ actor: { role: 'owner' } });
  });

  it('is off unless the launcher turns it on', async () => {
    const res = await ask(setup({ localSignIn: false }));
    expect(res.json()).toEqual({ available: false });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    ['another site', { ...HERE, origin: 'https://evil.example' }],
    ['no origin', { host: HERE.host }],
    ['a rebound host name', { ...HERE, host: 'evil.example:8780' }],
    ['a forwarded request', { ...HERE, 'x-forwarded-for': '203.0.113.9' }],
  ])('is refused for %s', async (_name, headers) => {
    const res = await ask(setup(), headers);
    expect(res.json()).not.toHaveProperty('csrf');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('is refused from another machine and behind a trusted proxy', async () => {
    expect((await ask(setup(), HERE, '192.168.1.50')).json()).toEqual({ available: false });
    expect((await ask(setup({ trustProxy: '10.0.0.1' }))).json()).toEqual({ available: false });
  });
});
