import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pairingFailure } from '../../apps/control/src/services/pairing.js';

describe('pairingFailure', () => {
  it('tells apart unreachable, unauthorised and any other answer', () => {
    const unreachable = pairingFailure(null, 'http://127.0.0.1:1', '/d');
    expect(unreachable).toContain('Could not reach http://127.0.0.1:1');
    const unauthorised = pairingFailure(401, 'http://127.0.0.1:1', '/d');
    expect(unauthorised).toContain('did not accept the owner token in /d');
    expect(unauthorised).toContain('AETHER_DATA_DIR');
    expect(unauthorised).not.toContain('Is the control plane running');
    expect(pairingFailure(500, 'http://x', '/d')).toBe(
      'http://x answered 500 when asked for a pairing code.',
    );
  });
});

describe('pnpm run pair', () => {
  let server: Server | undefined;
  afterEach(() => void server?.close());
  const pair = (url: string, dataDir: string) =>
    spawnSync(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'apps/control/src/pair-cli.ts')],
      {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', AETHER_CONTROL_URL: url, AETHER_DATA_DIR: dataDir },
      },
    );

  it('says so when the control plane is not reachable, or rejects the token, or there is no token', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aether-pair-'));
    expect(pair('http://127.0.0.1:9', dir).stderr).toContain('No owner token');
    writeFileSync(join(dir, 'owner-token'), 'wrong-token\n');
    expect(pair('http://127.0.0.1:9', dir).stderr).toContain('Could not reach http://127.0.0.1:9');
    server = createServer((_, res) => res.writeHead(401).end());
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const rejected = await new Promise<string>((done) => {
      // spawnSync would block the server's event loop, so the child runs asynchronously
      import('node:child_process').then(({ execFile }) =>
        execFile(
          process.execPath,
          [
            '--import',
            import.meta.resolve('tsx'),
            join(process.cwd(), 'apps/control/src/pair-cli.ts'),
          ],
          {
            env: { PATH: process.env['PATH'] ?? '', AETHER_CONTROL_URL: url, AETHER_DATA_DIR: dir },
          },
          (_error, _out, err) => done(err),
        ),
      );
    });
    expect(rejected).toContain('did not accept the owner token');
  }, 30000);
});
