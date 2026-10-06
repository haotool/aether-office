import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { createRequire } from 'node:module';
import {
  PAIRING_TTL_MS,
  createPairingStore,
  lanOrigins,
  pairingText,
  terminalQr,
} from '../../apps/control/src/services/pairing.js';
import { fixture } from './fixture.js';

// qrcode belongs to the control app, so it is resolved from there rather than hoisted into the root
const QRCode = createRequire(new URL('../../apps/control/package.json', import.meta.url))(
  'qrcode',
) as {
  create(
    text: string,
    options: { errorCorrectionLevel: string },
  ): { modules: { size: number; data: Uint8Array } };
};

const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});

describe('the pairing codes', () => {
  it('work once, for the person who asked, and expire on the server', () => {
    let now = 1_000;
    const store = createPairingStore(() => now);
    const { code, id } = store.create('owner-1');
    expect(store.status(id, 'owner-1')).toBe('pending');
    expect(store.status(id, 'someone-else')).toBe('expired'); // nobody else learns whether it exists
    expect(store.redeem(code)).toBe('owner-1');
    expect(store.status(id, 'owner-1')).toBe('paired');
    expect(() => store.redeem(code)).toThrow('PAIRING_INVALID'); // not twice
    const late = store.create('owner-1');
    now += PAIRING_TTL_MS + 1;
    expect(() => store.redeem(late.code)).toThrow('PAIRING_INVALID'); // not after five minutes
    expect(() => store.redeem('x'.repeat(22))).toThrow('PAIRING_INVALID'); // the same answer for a guess
  });

  it('are limited to a few waiting at a time', () => {
    const store = createPairingStore(() => 0);
    for (let i = 0; i < 5; i++) store.create('owner-1');
    expect(() => store.create('owner-1')).toThrow('PAIRING_LIMIT');
    expect(() => store.create('owner-2')).not.toThrow();
  });
});

describe('the addresses a phone can use', () => {
  const nic = (address: string, internal = false) => [
    { address, family: 'IPv4' as const, internal, netmask: '', mac: '', cidr: null },
  ];
  it('are the real private ones, best first, without link-local or virtual interfaces', () => {
    const interfaces = {
      lo0: nic('127.0.0.1', true),
      utun4: nic('10.8.0.2'),
      docker0: nic('172.17.0.1'),
      en1: nic('172.20.1.5'),
      en2: nic('169.254.9.9'),
      tailscale0: nic('100.64.0.3'),
      en3: nic('8.8.8.8'),
      en0: nic('192.168.1.20'),
    };
    expect(lanOrigins('4310', interfaces)).toEqual([
      'http://192.168.1.20:4310',
      'http://172.20.1.5:4310',
    ]);
  });
});

describe('the QR code in the terminal', () => {
  it('is a clean block with a quiet zone that holds the same modules as the code', () => {
    const url = 'http://192.168.1.20:4310/#pair=AAAAAAAAAAAAAAAAAAAAAA';
    const { size, data } = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
    const lines = terminalQr(url).split('\n');
    // eslint-disable-next-line no-control-regex
    const rows = lines.map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''));
    const side = size + 8;
    expect(rows.length).toBe(Math.ceil(side / 2));
    for (const row of rows) expect([...row]).toHaveLength(side); // every row as wide as the rest
    expect(lines.every((l) => l.startsWith('\u001b[30;47m') && l.endsWith('\u001b[0m'))).toBe(true);
    // decode: top and bottom module of every character
    const dark = (r: number, c: number) => {
      const glyph = [...rows[Math.floor(r / 2)]!][c]!;
      return r % 2 === 0 ? '█▀'.includes(glyph) : '█▄'.includes(glyph);
    };
    for (let r = 0; r < side; r++)
      for (let c = 0; c < side; c++) {
        const inside = r >= 4 && c >= 4 && r < 4 + size && c < 4 + size;
        expect(dark(r, c)).toBe(inside && !!data[(r - 4) * size + c - 4]);
      }
  });
});

describe('signing a phone in by scanning', () => {
  function setup(lan: boolean) {
    const f = fixture();
    clean.push(() => f.control.close());
    const app = createServer(f.control, {
      origin: 'http://127.0.0.1:4310',
      lan,
      lanAddresses: (port) => [`http://192.168.1.20:${port}`, `http://10.0.0.7:${port}`],
    });
    clean.push(() => app.close());
    return { ...f, app };
  }
  const HOST = { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310' };
  const bearer = (f: ReturnType<typeof setup>) => ({
    ...HOST,
    authorization: `Bearer ${f.owner.token}`,
  });

  it('gives a link with the code in the fragment and a QR code, then signs the phone in once', async () => {
    const f = setup(true);
    const made = await f.app.inject({ method: 'POST', url: '/api/pairings', headers: bearer(f) });
    expect(made.statusCode).toBe(200);
    const body = made.json() as {
      links: { url: string; svg: string }[];
      ttlSeconds: number;
      id: string;
    };
    expect(body.ttlSeconds).toBe(300);
    const link = body.links[0]!;
    expect(link.url).toMatch(/^http:\/\/192\.168\.1\.20:4310\/#pair=[A-Za-z0-9_-]{22}$/); // fragment, not query
    expect(link.svg).toContain('<svg');
    // one code for every address: the links differ only by host, and only one code is waiting
    expect(body.links.map((l) => l.url.split('#pair=')[1])).toEqual([
      link.url.split('#pair=')[1],
      link.url.split('#pair=')[1],
    ]);
    expect(body.links[1]!.url).toMatch(/^http:\/\/10\.0\.0\.7:4310\/#pair=/);
    const code = link.url.split('#pair=')[1]!;

    const redeemed = await f.app.inject({
      method: 'POST',
      url: '/api/pairings/redeem',
      headers: HOST,
      payload: { code },
    });
    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json()).toMatchObject({ actor: { role: 'owner' }, csrf: expect.any(String) });
    const cookie = String(redeemed.headers['set-cookie']);
    expect(cookie).toMatch(/aether_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Max-Age=2592000/); // a remembered device keeps its session for a month

    const again = await f.app.inject({
      method: 'POST',
      url: '/api/pairings/redeem',
      headers: HOST,
      payload: { code },
    });
    expect(again.statusCode).toBe(401); // single use
    const status = await f.app.inject({ url: `/api/pairings/${body.id}`, headers: bearer(f) });
    expect(status.json()).toEqual({ status: 'paired' }); // the desktop sees that it was used
  });

  it('refuses a stranger, a guess and a role that cannot pair', async () => {
    const f = setup(true);
    expect(
      (await f.app.inject({ method: 'POST', url: '/api/pairings', headers: HOST })).statusCode,
    ).toBe(401);
    const guess = await f.app.inject({
      method: 'POST',
      url: '/api/pairings/redeem',
      headers: HOST,
      payload: { code: 'A'.repeat(22) },
    });
    expect(guess.statusCode).toBe(401);
  });

  it('says there is no address to scan when LAN access is off', async () => {
    const f = setup(false);
    const made = await f.app.inject({ method: 'POST', url: '/api/pairings', headers: bearer(f) });
    expect(made.json()).toMatchObject({ lan: false, links: [] });
  });

  it('keeps a typed token for a working day, or a month when the device is remembered', async () => {
    const f = setup(false);
    const day = await f.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: HOST,
      payload: { token: f.owner.token },
    });
    expect(String(day.headers['set-cookie'])).toMatch(/Max-Age=28800/);
    const month = await f.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: HOST,
      payload: { token: f.owner.token, remember: true },
    });
    expect(String(month.headers['set-cookie'])).toMatch(/Max-Age=2592000/);
  });
});

describe('the pairing text for a terminal', () => {
  it('shows the QR of the best address, lists the others and says the link is plain HTTP', () => {
    const links = [
      { origin: 'http://192.168.1.20:4310', url: 'http://192.168.1.20:4310/#pair=A' },
      { origin: 'http://10.0.0.5:4310', url: 'http://10.0.0.5:4310/#pair=A' },
    ];
    const text = pairingText(links, 300);
    expect(text).toContain(terminalQr(links[0]!.url));
    expect(text).toContain('http://192.168.1.20:4310');
    expect(text).toContain('Same code on the other addresses: http://10.0.0.5:4310');
    expect(text).toContain('expires in 5 minutes');
    expect(text).toContain('Plain HTTP');
  });
});
