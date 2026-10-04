import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  readProcessTable,
  zombiesUnder,
  type ProcessRow,
} from '../../apps/control/src/services/agent-processes.js';
import { nudgeTargets, reapSessionZombies } from '../../apps/control/src/services/reap-zombies.js';
import type { LocalSession } from '../../packages/contracts/src/index.js';
import { alive, sleep } from './process-fixtures.js';

const row = (pid: number, ppid: number, stat = 'S', startedAt = pid * 1000): ProcessRow => ({
  pid,
  ppid,
  stat,
  startedAt,
  cpuSeconds: 0,
  cpuPercent: 0,
  rssBytes: 0,
  tty: '??',
  command: `p${pid}`,
});
const session = (zombies: number, over: Partial<LocalSession> = {}) =>
  ({
    key: 'claude:s',
    process: 'running',
    liveness: {
      state: 'active',
      startedAt: 1,
      quietMs: 0,
      zombies: Array.from({ length: zombies }, (_, i) => ({
        pid: 900 + i,
        startedAt: 1,
        program: null,
      })),
    },
    ...over,
  }) as LocalSession;

describe('who is reminded to collect a zombie', () => {
  it('is the living parent inside the session tree, once, with how many it holds', () => {
    const rows = [
      row(100, 1), // the agent
      row(110, 100), // its shell
      row(111, 110, 'Z'), // a zombie held by the shell
      row(112, 110, 'Z'),
      row(113, 100, 'Z'), // a zombie held by the agent itself
      row(200, 1), // another session
      row(201, 200, 'Z'), // not ours
    ];
    expect(nudgeTargets(rows, 100).map((t) => [t.pid, t.zombies])).toEqual([
      [110, 2],
      [100, 1],
    ]);
  });

  it('never picks a process outside the tree or a parent that is itself dead', () => {
    const rows = [
      row(100, 1),
      row(150, 1),
      row(151, 150, 'Z'), // another tree
      row(120, 100, 'Z'), // held by the agent: the agent is reminded
      row(121, 120, 'Z'), // its parent is a zombie too: nobody to remind
    ];
    expect(nudgeTargets(rows, 100).map((t) => [t.pid, t.zombies])).toEqual([[100, 1]]);
  });
});

describe('asking for a nudge', () => {
  it('refuses what it cannot be sure of: no session, not running, a changed process, nothing to reap', async () => {
    await expect(reapSessionZombies({ session: undefined, pid: 1, startedAt: 1 })).rejects.toThrow(
      'SESSION_NOT_FOUND',
    );
    await expect(
      reapSessionZombies({ session: session(1, { process: 'none' }), pid: null, startedAt: 1 }),
    ).rejects.toThrow('SESSION_NOT_RUNNING');
    await expect(
      reapSessionZombies({ session: session(1), pid: process.pid, startedAt: 2 }),
    ).rejects.toThrow('PROCESS_CHANGED');
    await expect(
      reapSessionZombies({ session: session(0), pid: process.pid, startedAt: 1 }),
    ).rejects.toThrow('NO_ZOMBIES');
    const started = (await readProcessTable()).find((r) => r.pid === process.pid)!.startedAt;
    await expect(
      reapSessionZombies({
        session: session(1, { liveness: { ...session(1).liveness, startedAt: started } }),
        pid: process.pid,
        startedAt: started + 5000,
      }),
    ).rejects.toThrow('PROCESS_CHANGED'); // the pid is live but it is another life
  });

  it('reminds a stuck parent, which cannot collect: the zombie stays, and the parent is left alone', async () => {
    const parent = spawn(
      process.execPath,
      [
        '-e',
        "const {spawn}=require('node:child_process');spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'});" +
          'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,6000)',
      ],
      { stdio: 'ignore' },
    );
    try {
      await sleep(1200);
      const table = await readProcessTable();
      const startedAt = table.find((r) => r.pid === parent.pid)!.startedAt;
      expect(zombiesUnder(table, [parent.pid!]).get(parent.pid!)).toHaveLength(1);
      const signalled: number[] = [];
      const result = await reapSessionZombies({
        session: session(1, { liveness: { ...session(1).liveness, startedAt } }),
        pid: parent.pid!,
        startedAt,
        waitMs: 300,
        signal: (pid) => signalled.push(pid),
      });
      expect(signalled).toEqual([parent.pid]); // only the one that holds the zombie
      expect(result).toEqual({ nudged: 1, before: 1, after: 1 }); // a stuck loop reaps nothing
      expect(alive(parent.pid!)).toBe(true);
    } finally {
      parent.kill('SIGKILL');
    }
  }, 20000);
});
