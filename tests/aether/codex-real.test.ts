import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter } from '../../packages/providers/src/codex.js';
import { describe, expect, it } from 'vitest';
import { JsonRpcProcess } from '../../packages/providers/src/jsonrpc.js';

const codex = spawnSync('codex', ['--version'], { encoding: 'utf8' });
const installed = codex.status === 0 ? /\d+\.\d+\.\d+/.exec(codex.stdout)?.[0] : undefined;

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
  it('loads an isolated native thread through the actual adapter without starting a model turn', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aether-codex-compat-'));
    const adapter = new CodexAdapter(
      {
        binary: 'codex',
        cwd: root,
        maxTurns: 1,
        timeoutMs: 10000,
        env: { ...process.env, CODEX_HOME: root },
      },
      { processStarted: async () => {}, event: async () => {}, permission: async () => 'deny' },
    );
    try {
      expect(await adapter.run('Never submitted', AbortSignal.abort())).toMatchObject({
        outcome: 'cancelled',
      });
      expect(adapter.threadId).toBeTruthy();
    } finally {
      adapter.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 20000);
});
