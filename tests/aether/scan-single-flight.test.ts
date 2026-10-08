import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';

// One scan at a time: requests that arrive while a scan runs share it, and what a scan found is remembered per home.
const processes = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../apps/control/src/services/runtime/agent-processes.js', async (original) => {
  const real =
    await original<typeof import('../../apps/control/src/services/runtime/agent-processes.js')>();
  return {
    ...real,
    listAgentProcesses: async () => {
      processes.calls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return null;
    },
  };
});
const { resetLocalSessionCache, scanLocalSessions } =
  await import('../../apps/control/src/services/runtime/local-sessions.js');

async function homeWith(name: string) {
  const home = await mkdtemp(join(tmpdir(), 'aether-flight-'));
  const dir = join(home, '.claude/projects/-x');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${name}.jsonl`),
    `${JSON.stringify({ type: 'user', cwd: home, message: { content: 'x' } })}\n`,
  );
  return home;
}

beforeEach(() => {
  processes.calls = 0;
  resetLocalSessionCache();
});

it('shares one scan between requests that arrive while it runs', async () => {
  const home = await homeWith('one');
  const spool = join(home, 'none.jsonl');
  const results = await Promise.all(
    Array.from({ length: 5 }, () => scanLocalSessions(home, Date.now(), 5000, spool)),
  );
  expect(processes.calls).toBe(1);
  expect(results.every((r) => r === results[0])).toBe(true);
});

it('never answers one home with the sessions of another', async () => {
  const a = await homeWith('aaa');
  const b = await homeWith('bbb');
  const spool = join(a, 'none.jsonl');
  const first = await scanLocalSessions(a, Date.now(), 60_000, spool);
  const second = await scanLocalSessions(b, Date.now(), 60_000, spool);
  expect(first.map((s) => s.sessionId)).toEqual(['aaa']);
  expect(second.map((s) => s.sessionId)).toEqual(['bbb']);
});
