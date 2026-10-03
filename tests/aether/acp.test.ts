import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  ACP_SDK_VERSION,
  AcpAdapter,
  negotiationFrom,
  normalizeAcpUpdate,
} from '../../packages/providers/src/acp.js';
import type { ProviderEvent } from '../../packages/providers/src/protocol.js';

const fixture = resolve('packages/providers/src/acp-fixture.mjs');
const options = (extra: Partial<ConstructorParameters<typeof AcpAdapter>[0]> = {}) => ({
  command: process.execPath,
  args: [fixture],
  cwd: process.cwd(),
  timeoutMs: 15000,
  ...extra,
});

function sink(decision: 'approve' | 'deny' = 'approve') {
  const events: ProviderEvent[] = [];
  const permissions: string[] = [];
  return {
    events,
    permissions,
    sink: {
      processStarted: async () => {},
      event: async (e: ProviderEvent) => void events.push(e),
      permission: async (p: { toolId: string }) => {
        permissions.push(p.toolId);
        return decision;
      },
    },
  };
}

it('records wire protocol, offered version and SDK semver separately, and only trusts advertised capabilities', async () => {
  const adapter = new AcpAdapter(options(), sink().sink);
  const negotiation = await adapter.negotiate();
  expect(negotiation.versions).toMatchObject({
    wireProtocolVersion: expect.any(Number),
    offeredProtocolVersion: expect.any(Number),
    sdkVersion: ACP_SDK_VERSION,
    agent: { name: 'aether-acp-fixture' },
  });
  expect(negotiation.capabilities).toEqual({
    resume: false,
    image: false,
    audio: false,
    embeddedContext: true,
    mcp: false,
  });
  // The constant must track the installed SDK, so the recorded semver cannot silently drift.
  const installed = JSON.parse(
    readFileSync(
      resolve('packages/providers/node_modules/@agentclientprotocol/sdk/package.json'),
      'utf8',
    ),
  ) as { version: string };
  expect(ACP_SDK_VERSION).toBe(installed.version);
  expect(negotiationFrom({ protocolVersion: 1 }).capabilities.resume).toBe(false); // nothing advertised means nothing assumed
});

it('starts a session, streams canonical events, asks the platform before a tool runs, and hides thoughts', async () => {
  const approved = sink('approve');
  const result = await new AcpAdapter(options(), approved.sink).run(
    'Please run the tests',
    new AbortController().signal,
  );
  expect(result).toMatchObject({ outcome: 'submitted', summary: 'Hello world' });
  expect(approved.permissions).toEqual(['tool-1']);
  const kinds = approved.events.map((e) => e.kind);
  expect(kinds).toEqual([
    'session.started',
    'turn.started',
    'tool.requested',
    'tool.completed',
    'assistant.message',
    'turn.completed',
  ]);
  expect(JSON.stringify(approved.events)).not.toContain('PRIVATE_REASONING');

  const denied = sink('deny');
  const refusal = await new AcpAdapter(options(), denied.sink).run(
    'Please run the tests',
    new AbortController().signal,
  );
  expect(refusal.summary).toBe('Hello denied');
  expect(denied.events.map((e) => e.kind)).toContain('tool.failed'); // a refused tool is a failed tool, not a success
});

it('cancels a running prompt through session/cancel', async () => {
  const controller = new AbortController();
  const running = new AcpAdapter(options(), sink().sink).run('HANG please', controller.signal);
  setTimeout(() => controller.abort(), 500);
  expect((await running).outcome).toBe('cancelled');
});

it('maps tool lifecycle updates and ignores everything that is not a canonical fact', () => {
  const n = (update: object) => ({ sessionId: 's', update }) as never;
  expect(
    normalizeAcpUpdate(
      n({
        sessionUpdate: 'tool_call',
        toolCallId: 't',
        title: 'Edit',
        kind: 'edit',
        status: 'in_progress',
      }),
      'x',
    )[0],
  ).toMatchObject({ kind: 'tool.started', toolId: 't' });
  expect(
    normalizeAcpUpdate(
      n({ sessionUpdate: 'tool_call_update', toolCallId: 't', status: 'pending' }),
      'x',
    ),
  ).toEqual([]);
  expect(normalizeAcpUpdate(n({ sessionUpdate: 'plan', entries: [] }), 'x')).toEqual([]);
  expect(
    normalizeAcpUpdate(
      n({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'secret' } }),
      'x',
    ),
  ).toEqual([]);
});

it('negotiates with the real @agentclientprotocol/claude-agent-acp adapter (initialize only, no model call)', async () => {
  const real = resolve('node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js');
  const negotiation = await new AcpAdapter(
    {
      command: process.execPath,
      args: [real],
      cwd: process.cwd(),
      timeoutMs: 30000,
      env: { PATH: process.env['PATH'] ?? '', HOME: '/nonexistent-aether-test-home' },
    },
    sink().sink,
  ).negotiate();
  expect(negotiation.versions.wireProtocolVersion).toBeGreaterThanOrEqual(1);
  expect(negotiation.versions.agent?.name).toMatch(/claude/i);
  expect(typeof negotiation.capabilities.resume).toBe('boolean');
}, 45000);
