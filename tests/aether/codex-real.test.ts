import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { JsonRpcProcess } from '../../packages/providers/src/jsonrpc.js';

const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' });
const installed = codex.status === 0 ? /\d+\.\d+\.\d+/.exec(codex.stdout)?.[0] : undefined;

// Skipped on machines without Codex. `initialize` starts no thread and calls no model.
describe.skipIf(!installed)('the installed Codex CLI', () => {
  it('completes the app-server initialize handshake the adapter depends on', async () => {
    const rpc = new JsonRpcProcess('codex', ['app-server'], { cwd: process.cwd() });
    try {
      await rpc.ready;
      const response = (await rpc.request('initialize', {
        clientInfo: { name: 'aether_office_test', title: 'AETHER OFFICE test', version: '0.0.0' },
        capabilities: {
          experimentalApi: false,
          requestAttestation: false,
          explicitGatewayOauth: true,
          optOutNotificationMethods: [],
        },
      })) as Record<string, unknown>;
      rpc.notify('initialized');
      expect(typeof response['userAgent']).toBe('string');
      expect(String(response['userAgent'])).toContain(installed!.split('.').slice(0, 2).join('.'));
    } finally {
      rpc.close();
    }
  }, 20000);
});
