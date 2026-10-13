import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  groupAlive,
  groupStopper,
  isOrphan,
  judgeSurvivor,
  parseIdentity,
  processIdentity,
  reapSurvivor,
  signalGroup,
} from '../../packages/providers/src/index.js';
import { alive, orphan, startReady, until } from './process-fixtures.js';

const stubborn = () =>
  startReady(
    `process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000)`,
    { detached: true },
  );

describe('stopping a group', () => {
  it('signals the whole group, tolerates one that is gone, and ends a child that ignores SIGTERM', async () => {
    const child = await stubborn();
    expect(groupAlive(child.pid!)).toBe(true);
    const stopper = groupStopper(child, 300);
    stopper.stop();
    stopper.stop();
    expect(await until(() => !groupAlive(child.pid!))).toBe(true);
    expect(signalGroup(child.pid!, 'SIGTERM')).toBe(false);
  });

  it("does not signal after it is cancelled: the group id is the leader's pid, and pids are reused", async () => {
    const child = await stubborn();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const stopper = groupStopper(child, 200);
      stopper.stop();
      expect(vi.getTimerCount()).toBe(1);
      stopper.cancel();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(600);
    } finally {
      vi.useRealTimers();
    }
    expect(groupAlive(child.pid!)).toBe(true);
    signalGroup(child.pid!, 'SIGKILL');
  });
});

describe('judging what a recorded process is now', () => {
  const seen = (over: Partial<{ startedAt: string; ppid: number; stat: string }> = {}) => ({
    startedAt: 'Sat Oct  3 10:23:45 2026',
    ppid: 1,
    stat: 'S',
    command: 'claude',
    ...over,
  });
  const start = 'Sat Oct  3 10:23:45 2026';
  it('only an unchanged, running process whose owner has gone may be signalled', () => {
    expect(judgeSurvivor(start, null, null)).toBe('gone');
    expect(judgeSurvivor(start, seen({ startedAt: 'Sun Oct  4 01:00:00 2026' }), null)).toBe(
      'reused',
    );
    expect(judgeSurvivor(start, seen({ stat: 'Z' }), null)).toBe('zombie');
    expect(judgeSurvivor(start, seen({ ppid: 4000 }), { command: 'node runner.js' })).toBe('owned');
    expect(judgeSurvivor(start, seen({ ppid: 1 }), { command: '/sbin/launchd' })).toBe('orphaned');
    expect(judgeSurvivor(start, seen({ ppid: 4000 }), null)).toBe('orphaned');
    expect(
      judgeSurvivor(start, seen({ ppid: 900 }), { command: '/usr/lib/systemd/systemd --user' }),
    ).toBe('orphaned');
    expect(isOrphan({ ppid: 900 }, { command: '/usr/bin/zsh' })).toBe(false);
    expect(isOrphan({ ppid: 900 }, { command: 'systemd ' + ' '.repeat(100_000) + '--user' })).toBe(
      false,
    );
  });
  it('reads the identity processIdentity writes, with the colons of the time in it', () => {
    expect(parseIdentity('123:Sat Oct  3 10:23:45 2026')).toEqual({
      pid: 123,
      startedAt: 'Sat Oct  3 10:23:45 2026',
    });
    expect(parseIdentity('nonsense')).toBeNull();
  });
});

describe('reaping what a dead runner left behind', () => {
  it('terminates an orphan that is still the recorded process, group and all', async () => {
    const survivor = await orphan();
    expect(alive(survivor.pid)).toBe(true);
    const result = await reapSurvivor(survivor.identity, 3000);
    expect(result).toMatchObject({ verdict: 'orphaned' });
    expect(['terminated', 'killed']).toContain(result.action);
    expect(await until(() => !alive(survivor.pid))).toBe(true);
  }, 20000);

  it('leaves alone a process that something alive still owns, one whose pid was reused, and one that is gone', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      detached: true,
      stdio: 'ignore',
    });
    try {
      await until(() => alive(child.pid!));
      const identity = processIdentity(child);
      expect(await reapSurvivor(identity)).toEqual({ identity, verdict: 'owned', action: 'none' });
      expect(alive(child.pid!)).toBe(true);
      const reused = `${child.pid}:Mon Jan  1 00:00:00 2001`;
      expect(await reapSurvivor(reused)).toEqual({
        identity: reused,
        verdict: 'reused',
        action: 'none',
      });
      expect(alive(child.pid!)).toBe(true);
    } finally {
      child.kill('SIGKILL');
    }
    await until(() => !alive(child.pid!));
    const gone = `${child.pid}:Mon Jan  1 00:00:00 2001`;
    expect((await reapSurvivor(gone)).verdict).toBe('gone');
    expect(await reapSurvivor('garbage')).toEqual({
      identity: 'garbage',
      verdict: 'gone',
      action: 'none',
    });
  }, 20000);
});
