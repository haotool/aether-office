import { afterEach, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { parseTrustProxy } from '../../apps/control/src/services/host-policy.js';
import { fixture } from './fixture.js';

const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});
const PROXY = '127.0.0.1';
const host = { host: '127.0.0.1:4310' };

function setup(trustProxy?: string) {
  const f = fixture();
  clean.push(() => f.control.close());
  const app = createServer(f.control, {
    origin: 'http://127.0.0.1:4310',
    ...(trustProxy === undefined ? {} : { trustProxy }),
  });
  clean.push(() => app.close());
  const badLogin = (forwardedFor?: string, extra: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/login',
      headers: { ...host, ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}), ...extra },
      payload: { token: 'x'.repeat(40) },
    });
  return { ...f, app, badLogin };
}

it('by default a forwarded address is ignored: the login limit cannot be dodged by sending X-Forwarded-For', async () => {
  const f = setup();
  for (let i = 0; i < 10; i++) expect((await f.badLogin(`203.0.113.${i}`)).statusCode).toBe(401);
  expect((await f.badLogin('203.0.113.99')).statusCode).toBe(429);
});

it('with one trusted proxy hop each client has its own login limit, so one guesser cannot lock everyone out', async () => {
  const f = setup(PROXY);
  for (let i = 0; i < 10; i++) expect((await f.badLogin('203.0.113.1')).statusCode).toBe(401);
  expect((await f.badLogin('203.0.113.1')).statusCode).toBe(429);
  expect((await f.badLogin('203.0.113.2')).statusCode).toBe(401);
});

it('the hook routes refuse a request a proxy forwarded, with or without a trusted proxy', async () => {
  for (const hops of [undefined, PROXY]) {
    const f = setup(hops);
    const hook = (headers: Record<string, string>) =>
      f.app.inject({
        method: 'GET',
        url: `/api/hook/permission-requests/x?nonce=${'n'.repeat(24)}`,
        headers: { ...host, authorization: `Bearer ${'g'.repeat(43)}`, ...headers },
      });
    expect((await hook({})).statusCode).toBe(401); // a local hook: loopback, wrong token
    expect((await hook({ 'x-forwarded-for': '203.0.113.5' })).statusCode).toBe(403);
    expect((await hook({ forwarded: 'for=203.0.113.5' })).statusCode).toBe(403);
  }
});

it('the session cookie is Secure behind a trusted TLS-terminating proxy, never on a forged header', async () => {
  const secure = async (hops: string | undefined) => {
    const f = setup(hops);
    const res = await f.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: { ...host, 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.1' },
      payload: { token: f.owner.token },
    });
    expect(res.statusCode).toBe(200);
    return res.cookies[0]!.secure === true;
  };
  expect(await secure(undefined)).toBe(false);
  expect(await secure(PROXY)).toBe(true);
});

it('AETHER_TRUST_PROXY accepts only proxy addresses, never everything or a hop count', () => {
  expect(parseTrustProxy(undefined)).toBeUndefined();
  expect(parseTrustProxy(' ')).toBeUndefined();
  expect(parseTrustProxy('127.0.0.1, 10.0.0.0/8 ,::1,fd00::/8')).toBe(
    '127.0.0.1,10.0.0.0/8,::1,fd00::/8',
  );
  for (const bad of [
    'true',
    '1',
    'loopback',
    '0.0.0.0/33',
    '1.2.3.4/x',
    '1.2.3.4/8/8',
    '127.0.0.1,',
  ])
    expect(() => parseTrustProxy(bad), bad).toThrow('INVALID_TRUST_PROXY');
});
