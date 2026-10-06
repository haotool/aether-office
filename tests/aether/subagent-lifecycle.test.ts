import { expect, it } from 'vitest';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveHookState, readHookState } from '../../apps/control/src/services/hook-spool.js';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import { subagentSchema, localSessionSchema } from '../../packages/contracts/src/index.js';

const rec = (event: string, at: number, extra = {}) => ({
  at,
  provider: 'claude' as const,
  event,
  sessionId: 's1',
  cwd: '/x',
  ...extra,
});

it('tracks a subagent lifecycle: running with its tool count, finished for 90 s, then gone', () => {
  const records = [
    rec('UserPromptSubmit', 1_000),
    rec('SubagentStart', 2_000, { agentId: 'a1', agentType: 'Explore' }),
    rec('PreToolUse', 3_000, { agentId: 'a1', agentType: 'Explore', tool: 'Read', target: 'a.ts' }),
    rec('PreToolUse', 4_000, { agentId: 'a1', agentType: 'Explore', tool: 'Grep' }),
    rec('PreToolUse', 5_000, { agentId: 'a1', agentType: 'Explore', tool: 'Read', target: 'b.ts' }),
  ];
  const running = deriveHookState(records, 6_000).get('claude:s1')!.subagents;
  expect(running).toEqual([
    expect.objectContaining({
      id: 'a1',
      type: 'Explore',
      source: 'hook',
      status: 'running',
      startedAt: 2_000,
      endedAt: null,
      tools: { count: 3, last: 'Read', lastAt: 5_000 },
    }),
  ]);
  const stopped = [...records, rec('SubagentStop', 7_000, { agentId: 'a1', agentType: 'Explore' })];
  const done = deriveHookState(stopped, 8_000).get('claude:s1')!.subagents[0]!;
  expect(done).toMatchObject({ status: 'finished', startedAt: 2_000, endedAt: 7_000 });
  expect(done.tools?.count).toBe(3);
  expect(deriveHookState(stopped, 7_000 + 89_000).get('claude:s1')!.subagents).toHaveLength(1);
  expect(deriveHookState(stopped, 7_000 + 90_000).get('claude:s1')!.subagents).toEqual([]);
  // The parent's own activity and current tool are untouched by its helpers' calls.
  const parent = deriveHookState(records, 6_000).get('claude:s1')!;
  expect(parent.tool).toBeNull();
  expect(parent.activity).toBe('working');
});

it('marks a subagent waiting on a permission prompt until its next event, and tags its calls with its id', () => {
  const base = [
    rec('SubagentStart', 1_000, { agentId: 'a1', agentType: 'Plan' }),
    rec('PreToolUse', 2_000, { agentId: 'a1', tool: 'Bash', target: 'pnpm' }),
    rec('PreToolUse', 2_500, { tool: 'Edit', target: 'own.ts' }),
    rec('PermissionRequest', 3_000, { agentId: 'a1' }),
  ];
  const waiting = deriveHookState(base, 4_000).get('claude:s1')!;
  expect(waiting.subagents[0]!.status).toBe('waiting_permission');
  expect(waiting.recent.map((r) => [r.tool, r.agentId])).toEqual([
    ['Bash', 'a1'],
    ['Edit', null],
  ]);
  const resumed = [...base, rec('PreToolUse', 5_000, { agentId: 'a1', tool: 'Read' })];
  expect(deriveHookState(resumed, 6_000).get('claude:s1')!.subagents[0]!.status).toBe('running');
});

it('ignores stray records of a subagent after its stop; a stop with no start is finished', () => {
  const records = [
    rec('SubagentStop', 1_000, { agentId: 'a1', agentType: 'Plan' }),
    rec('PreToolUse', 2_000, { agentId: 'a1', tool: 'Read' }),
  ];
  const [child] = deriveHookState(records, 3_000).get('claude:s1')!.subagents;
  expect(child).toMatchObject({ status: 'finished', startedAt: null, endedAt: 1_000 });
  expect(child!.tools).toBeNull();
});

it('reads the lifecycle from a real spool file in the receiver format', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-life-'));
  const file = join(dir, 'spool.jsonl');
  const lines = [
    rec('SubagentStart', 1_000, { agentId: 'a1', agentType: 'Explore' }),
    rec('PreToolUse', 1_500, { agentId: 'a1', tool: 'Read' }),
  ];
  await writeFile(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const state = (await readHookState(file, 2_000)).get('claude:s1')!;
  expect(state.subagents[0]).toMatchObject({ status: 'running', tools: { count: 1 } });
});

it('parses a payload from an older control plane (no lifecycle fields) with unknown defaults', () => {
  expect(subagentSchema.parse({ id: 'a', type: 'Plan', lastSeen: 5 })).toEqual({
    id: 'a',
    type: 'Plan',
    lastSeen: 5,
    source: 'hook',
    status: 'unknown',
    startedAt: null,
    endedAt: null,
    nickname: null,
    tools: null,
    label: null,
    tokens: null,
    result: null,
  });
  const full = subagentSchema.parse({
    id: 'a',
    type: 'Plan',
    lastSeen: 5,
    status: 'finished',
    endedAt: 9,
    nickname: 'Faraday',
    tools: { count: 2, last: 'Read', lastAt: 4 },
  });
  expect(subagentSchema.parse(JSON.parse(JSON.stringify(full)))).toEqual(full);
  expect(
    subagentSchema.safeParse({ id: 'a', type: 'x', lastSeen: 1, nickname: 'x'.repeat(41) }).success,
  ).toBe(false);
  expect(localSessionSchema.shape.subagents.element).toBe(subagentSchema);
});

it('gives a spawned Codex child its start time and nickname, finishes it after two quiet minutes, then drops it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-codex-life-'));
  const dir = join(home, '.codex/sessions/2026/10/04');
  await mkdir(dir, { recursive: true });
  const parent = '01a100f1-0000-7000-8000-000000000011';
  const child = '01a10196-0000-7000-8000-000000000012';
  const meta = (id: string, source: unknown) =>
    `${JSON.stringify({ timestamp: '2026-10-04T10:00:00.500Z', type: 'session_meta', payload: { id, timestamp: '2026-10-04T10:00:00.000Z', cwd: home, source } })}\n`;
  await writeFile(join(dir, `rollout-t-${parent}.jsonl`), meta(parent, 'exec'));
  const childFile = join(dir, `rollout-t-${child}.jsonl`);
  await writeFile(
    childFile,
    meta(child, {
      subagent: {
        thread_spawn: { parent_thread_id: parent, agent_role: 'worker', agent_nickname: 'Faraday' },
      },
    }),
  );
  const mtime = (await stat(childFile)).mtimeMs;
  const scan = async (now: number) => {
    resetLocalSessionCache();
    return (await scanLocalSessions(home, now, 0, join(home, 'none.jsonl')))[0]!.subagents;
  };
  expect(await scan(mtime + 1_000)).toEqual([
    expect.objectContaining({
      source: 'rollout',
      status: 'running',
      nickname: 'Faraday',
      startedAt: Date.parse('2026-10-04T10:00:00.000Z'),
      endedAt: null,
    }),
  ]);
  expect(await scan(mtime + 121_000)).toEqual([
    expect.objectContaining({ status: 'finished', endedAt: Math.round(mtime) }),
  ]);
  expect(await scan(mtime + 121_000 + 90_000)).toEqual([]);
});
