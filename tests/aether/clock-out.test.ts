import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readProcessTable } from '../../apps/control/src/services/agent-processes.js';
import { clockOutSessions } from '../../apps/control/src/services/clock-out.js';
import type { AttributedSession } from '../../packages/contracts/src/index.js';
import { alive, sleep, until } from './process-fixtures.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const run = (script = 'setInterval(()=>{},1000)') =>
  spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
const startOf = async (pid: number) =>
  (await readProcessTable()).find((r) => r.pid === pid)!.startedAt;

/** A session as the scanner would report it, for a real process with a made-up idle age. */
const session = (
  key: string,
  startedAt: number,
  quietMs: number,
  over: Partial<AttributedSession> = {},
) =>
  ({
    key,
    projectId: 'p1',
    process: 'running',
    resources: { cpuPercent: 0, rssBytes: 40_000_000 },
    liveness: { state: quietMs >= 6 * HOUR ? 'dormant' : 'idle', startedAt, quietMs, zombies: [] },
    ...over,
  }) as AttributedSession;

describe('clocking sessions out in bulk', () => {
  it('ends the idle ones for real (SIGKILL for one that ignores SIGTERM) and leaves every other session alone, each with its own result', async () => {
    const children = {
      idle: run(),
      stubborn: run("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"),
      used: run(),
      recent: run(),
      swapped: run(),
      foreign: run(),
    };
    try {
      await sleep(500);
      const start = Object.fromEntries(
        await Promise.all(
          Object.entries(children).map(async ([k, c]) => [k, await startOf(c.pid!)] as const),
        ),
      ) as Record<keyof typeof children, number>;
      const pids = new Map(Object.entries(children).map(([k, c]) => [`claude:${k}`, c.pid!]));
      const known = [
        session('claude:idle', start.idle, 2 * DAY),
        session('claude:stubborn', start.stubborn, 3 * DAY),
        session('claude:used', start.used, 2 * DAY, {
          liveness: { state: 'active', startedAt: start.used, quietMs: 1000, zombies: [] },
        }),
        session('claude:recent', start.recent, 5 * HOUR), // idle, but not for a day
        session('claude:swapped', start.swapped, 2 * DAY),
        session('claude:foreign', start.foreign, 2 * DAY, { projectId: 'other' }),
        session('claude:headless', 1, 2 * DAY, { projectId: null }),
      ];
      const asked: [string, number][] = [
        ['claude:idle', start.idle],
        ['claude:stubborn', start.stubborn],
        ['claude:used', start.used],
        ['claude:recent', start.recent],
        ['claude:swapped', start.swapped + 1000],
        ['claude:foreign', start.foreign],
        ['claude:headless', 1],
        ['claude:nobody', 1],
        ['claude:idle', start.idle], // asked twice: answered once
      ];
      const results = await clockOutSessions({
        request: {
          minIdleMs: DAY,
          sessions: asked.map(([key, startedAt]) => ({ key, startedAt })),
        },
        sessions: known,
        pidOf: (key) => pids.get(key) ?? null,
        mayStop: (projectId) => projectId === 'p1',
        graceMs: 600,
      });
      expect(results).toEqual([
        { key: 'claude:idle', outcome: 'cleared', freedBytes: 40_000_000 },
        { key: 'claude:stubborn', outcome: 'cleared', freedBytes: 40_000_000 },
        { key: 'claude:used', outcome: 'skipped', reason: 'active' },
        { key: 'claude:recent', outcome: 'skipped', reason: 'active' },
        { key: 'claude:swapped', outcome: 'skipped', reason: 'changed' },
        { key: 'claude:foreign', outcome: 'skipped', reason: 'forbidden' },
        { key: 'claude:headless', outcome: 'skipped', reason: 'no_project' },
        { key: 'claude:nobody', outcome: 'skipped', reason: 'not_found' },
      ]);
      expect(await until(() => !alive(children.idle.pid!) && !alive(children.stubborn.pid!))).toBe(
        true,
      );
      for (const k of ['used', 'recent', 'swapped', 'foreign'] as const)
        expect(alive(children[k].pid!)).toBe(true); // untouched
    } finally {
      for (const c of Object.values(children)) c.kill('SIGKILL');
    }
  }, 40000);
});
