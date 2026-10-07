import { existsSync, statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { append } from '../../packages/providers/src/hook-receiver.mjs';
import { readHookState } from '../../apps/control/src/services/hook-spool.js';

const rec = (event: string, at: number, extra = {}) => ({
  at,
  provider: 'claude',
  event,
  sessionId: 's1',
  cwd: '/x',
  ...extra,
});

it('keeps the hook state, a waiting prompt and a running subagent across a spool rotation', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'aether-rotate-')), 'hooks.jsonl');
  const filler = rec('PostToolUse', 2_000, { sessionId: 'other', target: 'x'.repeat(900) });
  while (!existsSync(file) || statSync(file).size < 1024 * 1024 - 8 * 1024) append(filler, file);
  append(rec('SubagentStart', 3_000, { agentId: 'a1', agentType: 'Explore' }), file);
  append(rec('PermissionRequest', 3_500, { tool: 'Bash' }), file);
  // Another session's traffic crosses the threshold: the next append moves the spool to `.1`.
  while (!existsSync(`${file}.1`)) append(filler, file);
  expect(statSync(file).size).toBeLessThan(2_000);
  const states = await readHookState(file, 4_000);
  expect(states.get('claude:s1')).toMatchObject({ activity: 'waiting_permission' });
  expect(states.get('claude:s1')!.subagents).toEqual([
    expect.objectContaining({ id: 'a1', status: 'running' }),
  ]);
});
