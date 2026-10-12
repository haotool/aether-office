import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { hostPolicy, isLanHostname } from '../../apps/control/src/services/platform/host-policy.js';
import { uuid } from '../../apps/web/src/lib/platform/browser-compat.js';
import { fixture } from './fixture.js';

const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const fn of clean.splice(0).reverse()) await fn();
});

it('knows which host names are addresses on a private network', () => {
  for (const ok of [
    '192.168.1.20',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.1',
    '100.101.102.103',
    '169.254.1.1',
    '[fd12::1]',
    '[fe80::1]',
    'mac-mini.local',
    'localhost',
  ])
    expect(isLanHostname(ok), ok).toBe(true);
  for (const no of [
    '8.8.8.8',
    '172.32.0.1',
    '172.15.0.1',
    '100.128.0.1',
    '192.169.0.1',
    'evil.example',
    'evil.example.local.evil.com',
    '[2001:db8::1]',
    '192.168.1.20.evil.com',
    '',
  ])
    expect(isLanHostname(no), no).toBe(false);
});

describe('host policy', () => {
  const canonical = new URL('http://127.0.0.1:8780');
  it('accepts only the exact origin when LAN access is off', () => {
    const p = hostPolicy(canonical, false);
    expect(p.host('127.0.0.1:8780')).toBe(true);
    expect(p.host('192.168.1.20:8780')).toBe(false);
    expect(p.origin('http://192.168.1.20:8780')).toBe(false);
    expect(p.origin(undefined)).toBe(true);
  });
  it('with LAN access, also takes a private address on the same port, never a name or another port', () => {
    const p = hostPolicy(canonical, true);
    expect(p.host('127.0.0.1:8780')).toBe(true);
    expect(p.host('192.168.1.20:8780')).toBe(true);
    expect(p.host('mac-mini.local:8780')).toBe(true);
    expect(p.host('192.168.1.20:8781')).toBe(false);
    expect(p.host('192.168.1.20')).toBe(false);
    expect(p.host('evil.example:8780')).toBe(false);
    expect(p.host('8.8.8.8:8780')).toBe(false);
    expect(p.host(undefined)).toBe(false);
    expect(p.origin('http://192.168.1.20:8780')).toBe(true);
    expect(p.origin('https://192.168.1.20:8780')).toBe(false);
    expect(p.origin('http://evil.example:8780')).toBe(false);
    expect(p.origin('null')).toBe(false);
  });
});

describe('server with LAN access', () => {
  function setup(lan: boolean) {
    const f = fixture();
    clean.push(() => f.control.close());
    const app = createServer(f.control, { origin: 'http://127.0.0.1:8780', lan });
    clean.push(() => app.close());
    return { ...f, app };
  }
  const get = (f: ReturnType<typeof setup>, host: string, origin?: string) =>
    f.app.inject({
      url: '/api/projects',
      headers: {
        host,
        authorization: `Bearer ${f.owner.token}`,
        ...(origin ? { origin } : {}),
      },
    });
  it('serves a phone on the private network and still refuses everything else', async () => {
    const f = setup(true);
    expect((await get(f, '192.168.1.20:8780', 'http://192.168.1.20:8780')).statusCode).toBe(200);
    expect((await get(f, 'evil.example:8780')).statusCode).toBe(403);
    expect((await get(f, '192.168.1.20:8780', 'http://evil.example')).statusCode).toBe(403);
  });
  it('refuses the same phone when LAN access is off', async () => {
    const f = setup(false);
    expect((await get(f, '192.168.1.20:8780')).statusCode).toBe(403);
    expect((await get(f, '127.0.0.1:8780')).statusCode).toBe(200);
  });
});

it('makes a v4 UUID without crypto.randomUUID (a phone on plain HTTP has none)', () => {
  vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => globalThis.crypto && a.fill(7) });
  const id = uuid();
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
