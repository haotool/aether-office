import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { fixture } from './fixture.js';

const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});

function setup() {
  const f = fixture();
  clean.push(() => f.control.close());
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4310' });
  clean.push(() => app.close());
  return { ...f, app };
}
const get = (f: ReturnType<typeof setup>, encoding?: string) =>
  f.app.inject({
    url: '/api/capabilities', // a few KB of JSON
    headers: {
      host: '127.0.0.1:4310',
      authorization: `Bearer ${f.owner.token}`,
      ...(encoding ? { 'accept-encoding': encoding } : {}),
    },
  });

it('gzips a large JSON answer for a client that accepts it, and the bytes decode to the same answer', async () => {
  const f = setup();
  const plain = await get(f);
  const packed = await get(f, 'gzip, deflate');
  expect(plain.headers['content-encoding']).toBeUndefined();
  expect(packed.headers['content-encoding']).toBe('gzip');
  expect(packed.headers['vary']).toMatch(/accept-encoding/i);
  expect(packed.rawPayload.length).toBeLessThan(plain.rawPayload.length);
  expect(gunzipSync(packed.rawPayload).toString()).toBe(plain.payload);
});

it('leaves a client that asks for nothing, and small answers, alone', async () => {
  const f = setup();
  expect((await get(f, 'identity')).headers['content-encoding']).toBeUndefined();
  const small = await f.app.inject({
    url: '/health',
    headers: { host: '127.0.0.1:4310', 'accept-encoding': 'gzip' },
  });
  expect(small.headers['content-encoding']).toBeUndefined();
});
