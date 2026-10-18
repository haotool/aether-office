import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  assertSafeUrl,
  isPublicAddress,
  safeFetch,
} from '../../apps/control/src/services/platform/safe-fetch.js';

it('classifies private, loopback, link-local, metadata and mapped addresses as non-public', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::ffff:8.8.8.8',
    'not-an-ip',
  ])
    expect(isPublicAddress(ip), ip).toBe(false);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])
    expect(isPublicAddress(ip), ip).toBe(true);
});

it('rejects unsafe schemes, credentials, ports, hosts and mixed DNS answers', async () => {
  const resolver = async (host: string) =>
    host === 'rebind.test'
      ? ['8.8.8.8', '10.0.0.1']
      : host === 'ok.test'
        ? ['8.8.8.8']
        : ['127.0.0.1'];
  await expect(assertSafeUrl('file:///etc/passwd', { resolver })).rejects.toThrow(
    'URL_SCHEME_FORBIDDEN',
  );
  await expect(assertSafeUrl('ftp://ok.test/', { resolver })).rejects.toThrow(
    'URL_SCHEME_FORBIDDEN',
  );
  await expect(assertSafeUrl('https://user:pw@ok.test/', { resolver })).rejects.toThrow(
    'URL_CREDENTIALS_FORBIDDEN',
  );
  await expect(assertSafeUrl('https://ok.test:22/', { resolver })).rejects.toThrow(
    'URL_PORT_FORBIDDEN',
  );
  await expect(
    assertSafeUrl('http://169.254.169.254/latest/meta-data', { resolver }),
  ).rejects.toThrow('URL_ADDRESS_FORBIDDEN');
  await expect(assertSafeUrl('http://[::1]/', { resolver })).rejects.toThrow(
    'URL_ADDRESS_FORBIDDEN',
  );
  for (const url of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/latest'])
    await expect(assertSafeUrl(url, { resolver }), url).rejects.toThrow('URL_ADDRESS_FORBIDDEN');
  await expect(assertSafeUrl('https://localhost/', { resolver })).rejects.toThrow(
    'URL_ADDRESS_FORBIDDEN',
  );
  await expect(assertSafeUrl('https://rebind.test/', { resolver })).rejects.toThrow(
    'URL_ADDRESS_FORBIDDEN',
  );
  await expect(assertSafeUrl('not a url')).rejects.toThrow('URL_INVALID');
  expect((await assertSafeUrl('https://ok.test/x', { resolver })).address).toBe('8.8.8.8');
});

let server: http.Server;
let port: number;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/redirect-meta')
      res.writeHead(302, { location: 'http://169.254.169.254/latest' }).end();
    else if (req.url === '/echo') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => res.end(`${req.method}:${req.headers['authorization'] ?? ''}:${body}`));
    } else if (req.url === '/redirect-same') res.writeHead(302, { location: '/' }).end();
    else if (req.url === '/loop') res.writeHead(302, { location: '/loop' }).end();
    else if (req.url === '/big') res.end(Buffer.alloc(5000));
    else if (req.url === '/slow') setTimeout(() => res.end('late'), 500);
    else res.end('hello');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

it('fetches within bounds, revalidates redirects, and refuses private targets by default', async () => {
  // Policy permits only the loopback test server; the default policy would block it.
  const policy = {
    ports: [port],
    isAllowed: (ip: string) => ip === '127.0.0.1',
    maxBytes: 1000,
    timeoutMs: 200,
  };
  expect((await safeFetch(`http://127.0.0.1:${port}/`, policy)).body.toString()).toBe('hello');
  await expect(safeFetch(`http://127.0.0.1:${port}/redirect-meta`, policy)).rejects.toThrow(
    /URL_(PORT|ADDRESS)_FORBIDDEN/,
  );
  await expect(safeFetch(`http://127.0.0.1:${port}/loop`, policy)).rejects.toThrow(
    'URL_TOO_MANY_REDIRECTS',
  );
  await expect(safeFetch(`http://127.0.0.1:${port}/big`, policy)).rejects.toThrow(
    'URL_RESPONSE_TOO_LARGE',
  );
  await expect(safeFetch(`http://127.0.0.1:${port}/slow`, policy)).rejects.toThrow('URL_TIMEOUT');
  await expect(safeFetch(`http://127.0.0.1:${port}/`, { ports: [port] })).rejects.toThrow(
    'URL_ADDRESS_FORBIDDEN',
  );
});

it('sends method, headers and body, and never forwards credentials through a redirect', async () => {
  const policy = { ports: [port], isAllowed: (ip: string) => ip === '127.0.0.1' };
  const echoed = await safeFetch(`http://127.0.0.1:${port}/echo`, policy, {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: '{"q":1}',
  });
  expect(echoed.body.toString()).toBe('POST:Bearer t:{"q":1}');
  // A POST is never redirected, and an authenticated GET only follows same-origin redirects.
  await expect(
    safeFetch(`http://127.0.0.1:${port}/redirect-same`, policy, { method: 'POST', body: '{}' }),
  ).rejects.toThrow('URL_REDIRECT_FORBIDDEN');
  await expect(
    safeFetch(`http://127.0.0.1:${port}/redirect-meta`, policy, {
      headers: { authorization: 'Bearer t' },
    }),
  ).rejects.toThrow(/URL_(REDIRECT|ADDRESS|PORT)_FORBIDDEN/);
  expect(
    (
      await safeFetch(`http://127.0.0.1:${port}/redirect-same`, policy, {
        headers: { authorization: 'x' },
      })
    ).body.toString(),
  ).toBe('hello');
});
