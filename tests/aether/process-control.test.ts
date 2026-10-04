import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
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
import { alive, orphan, sleep, until } from './process-fixtures.js';

/** A detached child (its own group) that ignores SIGTERM and has a grandchild of its own. */
const stubborn = () =>
  spawn(
    process.execPath,
    [
      '-e',
      `process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000)`,
    ],
    { detached: true, stdio: 'ignore' },
  );

describe('stopping a group', () => {
  it('signals the whole group, tolerates one that is gone, and ends a child that ignores SIGTERM', async () => {
    const child = stubborn();
    await sleep(400);
    expect(groupAlive(child.pid!)).toBe(true);
    const stopper = groupStopper(child, 300);
    stopper.stop();
    stopper.stop(); // asking twice does not start a second wait
    expect(await until(() => !groupAlive(child.pid!))).toBe(true); // the leader and its grandchild, by SIGKILL after 300 ms
    expect(signalGroup(child.pid!, 'SIGTERM')).toBe(false); // a group that is gone is not an error
  });

  it("does not signal after it is cancelled: the group id is the leader's pid, and pids are reused", async () => {
    const child = stubborn();
    await sleep(400);
    const stopper = groupStopper(child, 200);
    stopper.stop();
    stopper.cancel();
    await sleep(600);
    expect(groupAlive(child.pid!)).toBe(true); // SIGTERM was ignored and the SIGKILL never came
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
    expect(judgeSurvivor(start, seen({ ppid: 4000 }), null)).toBe('orphaned'); // its parent has vanished from the table
    expect(
      judgeSurvivor(start, seen({ ppid: 900 }), { command: '/usr/lib/systemd/systemd --user' }),
    ).toBe('orphaned');
    expect(isOrphan({ ppid: 900 }, { command: '/usr/bin/zsh' })).toBe(false);
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
      await sleep(300);
      const identity = processIdentity(child);
      expect(await reapSurvivor(identity)).toEqual({ identity, verdict: 'owned', action: 'none' }); // our own child
      expect(alive(child.pid!)).toBe(true);
      const reused = `${child.pid}:Mon Jan  1 00:00:00 2001`; // same pid, a different life
      expect(await reapSurvivor(reused)).toEqual({
        identity: reused,
        verdict: 'reused',
        action: 'none',
      });
      expect(alive(child.pid!)).toBe(true);
    } finally {
      child.kill('SIGKILL');
    }
    await sleep(200);
    const gone = `${child.pid}:Mon Jan  1 00:00:00 2001`;
    expect((await reapSurvivor(gone)).verdict).toBe('gone');
    expect(await reapSurvivor('garbage')).toEqual({
      identity: 'garbage',
      verdict: 'gone',
      action: 'none',
    });
  }, 20000);
});
