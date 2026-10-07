import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// pair-cli.ts is a script: it runs as it loads and ends with process.exit. These cases import it in this process (a real
// server on a free port, a real data directory) so the printed words and the exit code can be read; pair-cli.test.ts runs
// the same script as a child process.
class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}
let server: Server | undefined;
let requests: { auth?: string; origin?: string; method?: string }[];
const printed: string[] = [];
const complained: string[] = [];

async function serve(respond: (res: import('node:http').ServerResponse) => void) {
  server = createServer((req, res) => {
    requests.push({
      auth: req.headers.authorization,
      origin: req.headers.origin,
      method: req.method,
    });
    respond(res);
  });
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const dataDir = (token?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-pair-inproc-'));
  if (token) writeFileSync(join(dir, 'owner-token'), `${token}\n`);
  return dir;
};
const run = async (env: Record<string, string>) => {
  vi.resetModules();
  vi.stubEnv('AETHER_DATA_DIR', env['AETHER_DATA_DIR']!);
  vi.stubEnv('AETHER_CONTROL_URL', env['AETHER_CONTROL_URL'] ?? 'http://127.0.0.1:9');
  try {
    await import('../../apps/control/src/pair-cli.js');
    return undefined;
  } catch (error) {
    if (error instanceof Exit) return error.code;
    throw error;
  }
};

beforeEach(() => {
  requests = [];
  printed.length = 0;
  complained.length = 0;
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exit(code);
  }) as never);
  vi.spyOn(console, 'log').mockImplementation((text: string) => void printed.push(String(text)));
  vi.spyOn(console, 'error').mockImplementation(
    (text: string) => void complained.push(String(text)),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  server?.close();
  server = undefined;
});

describe('pair-cli, in this process', () => {
  it('exits with a hint when there is no owner token yet', async () => {
    const dir = dataDir();
    expect(await run({ AETHER_DATA_DIR: dir })).toBe(1);
    expect(complained.join('\n')).toContain(`No owner token in ${dir}`);
    expect(complained.join('\n')).toContain('pnpm start');
  });

  it('exits when the control plane cannot be reached, and never prints the token', async () => {
    const dir = dataDir('secret-token-value');
    expect(await run({ AETHER_DATA_DIR: dir })).toBe(1);
    expect(complained.join('\n')).toContain('Could not reach http://127.0.0.1:9');
    expect([...printed, ...complained].join('\n')).not.toContain('secret-token-value');
  });

  it('exits when the owner token is refused', async () => {
    const url = await serve((res) => res.writeHead(401).end('{}'));
    expect(await run({ AETHER_DATA_DIR: dataDir('t'), AETHER_CONTROL_URL: url })).toBe(1);
    expect(complained.join('\n')).toContain('did not accept the owner token');
  });

  it('exits when the control plane is not open to the network, so no phone could use the code', async () => {
    const url = await serve((res) =>
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ lan: false, ttlSeconds: 300, links: [] })),
    );
    expect(await run({ AETHER_DATA_DIR: dataDir('t'), AETHER_CONTROL_URL: url })).toBe(1);
    expect(complained.join('\n')).toContain('AETHER_HOST=0.0.0.0');
    expect(printed).toEqual([]);
  });

  it('asks with the owner token as a bearer and its own origin, and prints the QR code and every address', async () => {
    const url = await serve((res) =>
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          lan: true,
          ttlSeconds: 300,
          links: [
            { origin: 'http://192.168.1.5:4310', url: 'http://192.168.1.5:4310/#pair=abc' },
            { origin: 'http://10.0.0.2:4310', url: 'http://10.0.0.2:4310/#pair=abc' },
          ],
        }),
      ),
    );
    expect(
      await run({ AETHER_DATA_DIR: dataDir('owner-secret'), AETHER_CONTROL_URL: url }),
    ).toBeUndefined();
    expect(requests).toEqual([{ auth: 'Bearer owner-secret', origin: url, method: 'POST' }]);
    const text = printed.join('\n');
    expect(text).toContain('█');
    expect(text).toContain('http://192.168.1.5:4310');
    expect(text).toContain('Same code on the other addresses: http://10.0.0.2:4310');
    expect(text).toContain('expires in 5 minutes');
    expect(text).not.toContain('owner-secret');
  });
});
