import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { CodexAdapter } from '../../packages/providers/src/codex.js';
import { JsonRpcProcess } from '../../packages/providers/src/jsonrpc.js';
import type { ProviderEvent } from '../../packages/providers/src/protocol.js';
it('synthetic Codex process handles approval before turn/start response without deadlock; dedupes and drops private reasoning', async () => {
  const events: ProviderEvent[] = [];
  const permissions: string[] = [];
  const sent: string[] = [];
  const rpc = new JsonRpcProcess(
    process.execPath,
    [resolve('fixtures/processes/codex-app-server.mjs')],
    { cwd: process.cwd() },
  );
  const adapter = new CodexAdapter(
    { binary: process.execPath, cwd: process.cwd(), maxTurns: 1, timeoutMs: 5000 },
    {
      processStarted: async (identity) => {
        expect(identity).toMatch(/^\d+:/);
      },
      event: async (event) => {
        events.push(event);
      },
      permission: async (request) => {
        permissions.push(request.requestId);
        expect(request.providerSessionId).toBe('fixture-thread');
        expect(request.toolId).toBe('tool-1');
        return 'deny';
      },
      permissionSent: async (id) => {
        sent.push(id);
      },
    },
    rpc,
  );
  const result = await adapter.run('Synthetic wire fixture', new AbortController().signal);
  expect(result.outcome).toBe('submitted');
  expect(result.summary).toContain('decline');
  expect(permissions).toEqual(['permission-1']);
  expect(sent).toEqual(['permission-1']);
  expect(events.filter((e) => e.kind === 'tool.started')).toHaveLength(1);
  expect(events.filter((e) => e.kind === 'tool.failed')).toHaveLength(1);
  expect(events.filter((e) => e.kind === 'usage')).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain('PRIVATE_REASONING');
});

import { normalizeClaudeMessage } from '../../packages/providers/src/claude.js';
it('Claude normalization keeps proposal vs execution, marks is_error failures and ignores thinking', () => {
  const proposed = normalizeClaudeMessage(
    {
      type: 'assistant',
      uuid: 'message-1',
      parent_tool_use_id: 'parent-tool',
      message: {
        id: 'a',
        content: [
          { type: 'thinking', thinking: 'PRIVATE' },
          { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'false' } },
        ],
      },
    },
    'turn-1',
  );
  expect(proposed).toEqual([
    {
      kind: 'tool.requested',
      toolId: 'tool-1',
      turnId: 'turn-1',
      name: 'Bash',
      summary: 'Bash',
      parentToolId: 'parent-tool',
    },
  ]);
  const result = normalizeClaudeMessage(
    {
      type: 'user',
      parent_tool_use_id: 'parent-tool',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', is_error: true, content: 'exit 1' },
        ],
      },
    },
    'turn-1',
  );
  expect(result[0]?.kind).toBe('tool.failed');
  expect(
    normalizeClaudeMessage(
      { type: 'result', subtype: 'success', is_error: true, result: 'rate limited' },
      'turn-1',
    ).at(-1)?.kind,
  ).toBe('turn.failed');
});
