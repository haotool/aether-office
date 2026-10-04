import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readProcessTable } from '../../apps/control/src/services/agent-processes.js';
import { stopLocalSession, stopProcess } from '../../apps/control/src/services/stop-session.js';
import type { LocalSession } from '../../packages/contracts/src/index.js';
import { alive, sleep, until } from './process-fixtures.js';

const run = (script = 'setInterval(()=>{},1000)') =>
  spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
const startOf = async (pid: number) =>
  (await readProcessTable()).find((r) => r.pid === pid)!.startedAt;
const session = (
  state: LocalSession['liveness']['state'],
  startedAt: number | null,
  over: Partial<LocalSession> = {},
) =>
  ({
    key: 'claude:s',
    process: 'running',
    liveness: { state, startedAt, quietMs: 1, zombies: [] },
    ...over,
  }) as LocalSession;

describe('stopping a process by pid and start', () => {
  it('ends a process that is the one named, and reports one that has already gone', async () => {
    const child = run();
    await sleep(300);
    const startedAt = await startOf(child.pid!);
    expect(await stopProcess(child.pid!, startedAt, 3000)).toBe('stopped');
    expect(await until(() => !alive(child.pid!))).toBe(true);
    expect(await stopProcess(child.pid!, startedAt, 500)).toBe('stopped'); // gone is stopped
  }, 20000);

  it('does not touch a process whose pid now belongs to another life, and says when it will not end', async () => {
    const child = run();
    const stubborn = run("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)");
    try {
      await sleep(400);
      const startedAt = await startOf(child.pid!);
      expect(await stopProcess(child.pid!, startedAt + 5000, 500)).toBe('changed');
      expect(alive(child.pid!)).toBe(true);
      expect(await stopProcess(stubborn.pid!, await startOf(stubborn.pid!), 600)).toBe(
        'still_running',
      );
      expect(alive(stubborn.pid!)).toBe(true); // asked, not killed
    } finally {
      child.kill('SIGKILL');
      stubborn.kill('SIGKILL');
    }
  }, 20000);
});

describe('stopping the process behind a session', () => {
  it('refuses unless the session is dormant or orphaned, is still the process the person saw, and is not above the server', async () => {
    const child = run();
    try {
      await sleep(300);
      const startedAt = await startOf(child.pid!);
      const stop = (
        s: LocalSession | undefined,
        over: Partial<Parameters<typeof stopLocalSession>[0]> = {},
      ) => stopLocalSession({ session: s, pid: child.pid!, startedAt, graceMs: 2000, ...over });
      await expect(stop(undefined)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
      await expect(stop(session('dormant', startedAt, { process: 'none' }))).rejects.toMatchObject({
        code: 'SESSION_NOT_RUNNING',
      });
      await expect(stop(session('dormant', startedAt), { pid: null })).rejects.toMatchObject({
        code: 'SESSION_NOT_RUNNING',
      });
      await expect(stop(session('dormant', startedAt + 1000))).rejects.toMatchObject({
        code: 'PROCESS_CHANGED',
      });
      for (const state of ['active', 'idle', 'ended', 'unknown'] as const)
        await expect(stop(session(state, startedAt))).rejects.toMatchObject({
          code: 'SESSION_NOT_STALE',
        });
      // This test process is the child's parent and so above it: a session whose pid is the server's own, or an
      // ancestor's, is refused. Here the pretend server is the child itself.
      await expect(
        stop(session('orphaned', startedAt), { controlPid: child.pid! }),
      ).rejects.toMatchObject({ code: 'REFUSED_OWN_ANCESTOR' });
      expect(alive(child.pid!)).toBe(true); // nothing was signalled by any refusal
      expect(await stop(session('dormant', startedAt))).toEqual({ outcome: 'stopped' });
      expect(await until(() => !alive(child.pid!))).toBe(true);
    } finally {
      child.kill('SIGKILL');
    }
  }, 30000);
});
