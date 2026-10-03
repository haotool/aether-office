import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexAdapter } from '../../packages/providers/src/codex.js';
import { JsonRpcProcess } from '../../packages/providers/src/jsonrpc.js';
import type { ProviderEvent } from '../../packages/providers/src/protocol.js';

// Scripted app-server peers. They speak the same JSON-RPC wire as `codex app-server` but run no model.
const peer = (body: string) =>
  new JsonRpcProcess(process.execPath, ['-e', body], { cwd: process.cwd() });

const PRELUDE = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (v) => process.stdout.write(JSON.stringify(v) + '\\n');
const fs = require('node:fs');
const record = (name, value) => fs.appendFileSync(process.env.RECORD, JSON.stringify({ name, value }) + '\\n');
const T = 'thread-1';
const turn = (id, status) => ({ method: 'turn/completed', params: { threadId: T, turn: { id, status, error: null } } });
`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'aether-codex-proto-'));
  const file = join(dir, 'record.jsonl');
  process.env['RECORD'] = file;
  const recorded = () =>
    existsSync(file)
      ? readFileSync(file, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as { name: string; value: unknown })
      : [];
  return {
    recorded,
    done: () => (delete process.env['RECORD'], rmSync(dir, { recursive: true, force: true })),
  };
}

function sink() {
  const events: ProviderEvent[] = [];
  const permissions: { requestId: string; turnId: string; providerSessionId: string }[] = [];
  return {
    events,
    permissions,
    sink: {
      processStarted: async () => {},
      event: async (e: ProviderEvent) => void events.push(e),
      permission: async (p: { requestId: string; turnId: string; providerSessionId: string }) => (
        permissions.push(p),
        'approve' as const
      ),
    },
  };
}
const options = { binary: process.execPath, cwd: process.cwd(), maxTurns: 1, timeoutMs: 8000 };

describe('CodexAdapter against scripted app-server peers', () => {
  it('tolerates duplicated, late and foreign-thread notifications: each fact is emitted once, and the turn settles once', async () => {
    const { done } = setup();
    try {
      const rpc = peer(`${PRELUDE}
        rl.on('line', (line) => {
          const m = JSON.parse(line);
          if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'x', codexHome: '/', platformFamily: 'unix', platformOs: 'x' } });
          else if (m.method === 'thread/start') send({ id: m.id, result: { thread: { id: T } } });
          else if (m.method === 'turn/start') {
            // The message arrives before the turn is announced, then everything is repeated.
            const message = { method: 'item/completed', params: { threadId: T, turnId: 'turn-1', item: { type: 'agentMessage', id: 'm1', text: 'hello' } } };
            send(message);
            send({ id: m.id, result: { turn: { id: 'turn-1' } } });
            send({ method: 'turn/started', params: { threadId: T, turn: { id: 'turn-1' } } });
            send({ method: 'turn/started', params: { threadId: T, turn: { id: 'turn-1' } } });
            send(message);
            send({ method: 'item/completed', params: { threadId: 'other-thread', turnId: 'x', item: { type: 'agentMessage', id: 'foreign', text: 'not ours' } } });
            send({ method: 'item/started', params: { threadId: T, turnId: 'turn-1', item: { type: 'commandExecution', id: 't1', command: 'ls', status: 'inProgress' } } });
            send({ method: 'item/completed', params: { threadId: T, turnId: 'turn-1', item: { type: 'commandExecution', id: 't1', command: 'ls', status: 'completed', exitCode: 0 } } });
            send({ method: 'item/started', params: { threadId: T, turnId: 'turn-1', item: { type: 'commandExecution', id: 't1', command: 'ls', status: 'inProgress' } } }); // a late replay
            send({ method: 'some/future/notification', params: {} });
            send(turn('turn-1', 'completed'));
            send(turn('turn-1', 'completed'));
          }
        });`);
      const s = sink();
      const result = await new CodexAdapter(options, s.sink, rpc).run(
        'go',
        new AbortController().signal,
      );
      expect(result).toMatchObject({ outcome: 'submitted', summary: 'hello' });
      const kinds = s.events.map((e) => e.kind);
      expect(kinds.filter((k) => k === 'assistant.message')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'turn.started')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'turn.completed')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'tool.started')).toHaveLength(1);
      expect(JSON.stringify(s.events)).not.toContain('not ours');
    } finally {
      done();
    }
  });

  it('interrupts exactly the active turn of its own thread, and a completion from another thread never settles it', async () => {
    const { recorded, done } = setup();
    try {
      const rpc = peer(`${PRELUDE}
        rl.on('line', (line) => {
          const m = JSON.parse(line);
          if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'x', codexHome: '/', platformFamily: 'unix', platformOs: 'x' } });
          else if (m.method === 'thread/start') send({ id: m.id, result: { thread: { id: T } } });
          else if (m.method === 'turn/start') { send({ method: 'turn/started', params: { threadId: T, turn: { id: 'active-turn' } } }); send({ id: m.id, result: { turn: { id: 'active-turn' } } }); }
          else if (m.method === 'turn/interrupt') {
            record('interrupt', m.params);
            send({ id: m.id, result: {} });
            // A DIFFERENT thread finishes first: it must be ignored. Then ours reports the interruption.
            send({ method: 'turn/completed', params: { threadId: 'other-thread', turn: { id: 'other', status: 'completed', error: null } } });
            setTimeout(() => send(turn('active-turn', 'interrupted')), 50);
          }
        });`);
      const abort = new AbortController();
      const running = new CodexAdapter(options, sink().sink, rpc).run('long task', abort.signal);
      setTimeout(() => abort.abort(), 300);
      const result = await running;
      expect(result.outcome).toBe('cancelled');
      expect(
        recorded()
          .filter((r) => r.name === 'interrupt')
          .map((r) => r.value),
      ).toEqual([{ threadId: 'thread-1', turnId: 'active-turn' }]);
    } finally {
      done();
    }
  }, 20000);

  it('answers an approval request with the request id it came with, once, and refuses one scoped to another thread', async () => {
    const { recorded, done } = setup();
    try {
      const rpc = peer(`${PRELUDE}
        let pendingTurn;
        rl.on('line', (line) => {
          const m = JSON.parse(line);
          if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'x', codexHome: '/', platformFamily: 'unix', platformOs: 'x' } });
          else if (m.method === 'thread/start') send({ id: m.id, result: { thread: { id: T } } });
          else if (m.method === 'turn/start') {
            pendingTurn = m.id;
            // A request for some OTHER thread first (must be refused), then the real one.
            send({ id: 'req-foreign', method: 'item/commandExecution/requestApproval', params: { threadId: 'other-thread', turnId: 'turn-1', itemId: 'tool-x', command: 'rm -rf /' } });
          } else if (m.id === 'req-foreign') {
            record('foreign-answer', m);
            send({ id: 'req-real', method: 'item/commandExecution/requestApproval', params: { threadId: T, turnId: 'turn-1', itemId: 'tool-1', command: 'ls' } });
          } else if (m.id === 'req-real') {
            record('real-answer', m);
            send({ method: 'turn/started', params: { threadId: T, turn: { id: 'turn-1' } } });
            send({ id: pendingTurn, result: { turn: { id: 'turn-1' } } });
            send(turn('turn-1', 'completed'));
          }
        });`);
      const s = sink();
      await new CodexAdapter(options, s.sink, rpc).run('go', new AbortController().signal);
      // The platform was asked exactly once, about the right thread, under the provider's own request id.
      expect(s.permissions).toEqual([
        {
          requestId: 'req-real',
          turnId: 'turn-1',
          providerSessionId: 'thread-1',
          kind: 'command',
          toolId: 'tool-1',
          parameters: expect.any(Object),
        },
      ]);
      const answers = Object.fromEntries(
        recorded().map((r) => [r.name, r.value as { result?: unknown; error?: unknown }]),
      );
      expect(answers['foreign-answer']!.error).toBeDefined(); // refused, not approved
      expect(answers['foreign-answer']!.result).toBeUndefined();
      expect(answers['real-answer']!.result).toEqual({ decision: 'accept' }); // one invocation only
    } finally {
      done();
    }
  }, 20000);

  it('never offers steer: the adapter exposes the method but needs an active turn, and nothing calls it', async () => {
    const adapter = new CodexAdapter(
      options,
      sink().sink,
      peer(`${PRELUDE} rl.on('line', () => {});`),
    );
    await expect(adapter.steer('hello')).rejects.toThrow('ACTIVE_TURN_REQUIRED');
    adapter.close();
  });
});

describe('JSON-RPC correlation', () => {
  it('matches out-of-order responses to their callers, ignores unknown ids, and surfaces errors', async () => {
    const rpc = peer(`${PRELUDE}
      const waiting = [];
      rl.on('line', (line) => {
        const m = JSON.parse(line);
        if (!m.method) return;
        waiting.push(m);
        if (waiting.length === 3) {
          send({ id: 'never-requested', result: 'noise' });
          send({ id: waiting[2].id, result: 'third' });
          send({ id: waiting[0].id, result: 'first' });
          send({ id: waiting[1].id, error: { code: -32000, message: 'boom' } });
        }
      });`);
    await rpc.ready;
    const [a, b, c] = await Promise.allSettled([
      rpc.request('a', {}),
      rpc.request('b', {}),
      rpc.request('c', {}),
    ]);
    expect(a).toMatchObject({ status: 'fulfilled', value: 'first' });
    expect(b.status).toBe('rejected');
    expect(c).toMatchObject({ status: 'fulfilled', value: 'third' });
    rpc.close();
  });

  it('times out a request that is never answered, and clears it so nothing leaks', async () => {
    const rpc = peer(`${PRELUDE} rl.on('line', () => {});`);
    await rpc.ready;
    await expect(rpc.request('silence', {}, 200)).rejects.toThrow();
    rpc.close();
  });
});
