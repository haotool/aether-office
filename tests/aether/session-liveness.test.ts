import { expect, it } from 'vitest';
import { SESSION_ACTIVE_MS as ACTIVE_MS } from '../../packages/contracts/src/index.js';
import type { AgentProcess } from '../../apps/control/src/services/runtime/agent-processes.js';
import {
  CpuWatch,
  DORMANT_MS,
  classifyLiveness,
} from '../../apps/control/src/services/sessions/session-liveness.js';

const z = (pid: number) => ({ pid, startedAt: 0, program: 'node' });
const NOW = 1_000_000_000_000;
const HOUR = 3600_000;
const proc = (over: Partial<AgentProcess> = {}): AgentProcess => ({
  pid: 10,
  ppid: 5,
  provider: 'claude',
  cwd: '/x',
  resume: null,
  cpuPercent: 0,
  rssBytes: 0,
  startedAt: NOW - 30 * HOUR,
  cpuSeconds: 100,
  stat: 'S+',
  zombies: [],
  orphaned: false,
  ports: [],
  ...over,
});
const classify = (over: Partial<Parameters<typeof classifyLiveness>[0]> = {}) =>
  classifyLiveness({
    process: proc(),
    state: 'running',
    mtime: NOW - 10_000,
    hookAt: null,
    busyAt: null,
    now: NOW,
    ...over,
  });

it('is active for two minutes after the latest sign, idle after that, dormant after six hours', () => {
  expect(classify({ mtime: NOW - ACTIVE_MS + 1 }).state).toBe('active');
  expect(classify({ mtime: NOW - ACTIVE_MS }).state).toBe('idle');
  expect(classify({ mtime: NOW - DORMANT_MS + 1 }).state).toBe('idle');
  expect(classify({ mtime: NOW - DORMANT_MS }).state).toBe('dormant');
  expect(classify({ mtime: NOW - 20 * HOUR })).toEqual({
    state: 'dormant',
    startedAt: NOW - 30 * HOUR,
    quietMs: 20 * HOUR,
    zombies: [],
  });
});

it('counts a hook event or burned CPU as a sign of life, so a quiet transcript alone does not make it dormant', () => {
  const old = NOW - 20 * HOUR;
  expect(classify({ mtime: old }).state).toBe('dormant');
  expect(classify({ mtime: old, hookAt: NOW - 30_000 }).state).toBe('active');
  expect(classify({ mtime: old, busyAt: NOW - 30_000 }).state).toBe('active');
  expect(classify({ mtime: old, busyAt: NOW - 3 * HOUR }).state).toBe('idle');
});

it('never reads quiet as longer than the process has lived', () => {
  const young = proc({ startedAt: NOW - 60_000 });
  expect(classify({ process: young, mtime: NOW - 9 * HOUR })).toMatchObject({
    state: 'active',
    quietMs: 60_000,
  });
});

it('names an orphan before anything about activity, and carries the zombies under a process along', () => {
  expect(classify({ process: proc({ orphaned: true }), mtime: NOW }).state).toBe('orphaned');
  expect(classify({ process: proc({ zombies: [z(1), z(2), z(3)] }) })).toMatchObject({
    state: 'active',
    zombies: [z(1), z(2), z(3)],
  });
  expect(classify({ process: proc({ zombies: [z(4), z(5)], orphaned: true }) })).toMatchObject({
    state: 'orphaned',
    zombies: [z(4), z(5)],
  });
});

it('says ended without a process and unknown for threads inside a shared app server', () => {
  expect(classify({ process: null, state: 'none' })).toEqual({
    state: 'ended',
    startedAt: null,
    quietMs: null,
    zombies: [],
  });
  expect(classify({ process: null, state: 'unknown' })).toEqual({
    state: 'unknown',
    startedAt: null,
    quietMs: null,
    zombies: [],
  });
});

it('remembers CPU between looks, keyed by pid and start so a reused pid is a new process', () => {
  const watch = new CpuWatch();
  const p = proc({ cpuSeconds: 100, cpuPercent: 0 });
  watch.observe([p], NOW);
  expect(watch.busyAt(p)).toBeNull();
  watch.observe([{ ...p, cpuSeconds: 100.2 }], NOW + 10_000);
  expect(watch.busyAt(p)).toBeNull();
  watch.observe([{ ...p, cpuSeconds: 103 }], NOW + 20_000);
  expect(watch.busyAt(p)).toBe(NOW + 20_000);
  watch.observe([{ ...p, cpuSeconds: 103 }], NOW + 30_000);
  expect(watch.busyAt(p)).toBe(NOW + 20_000);
  const reused = proc({ startedAt: NOW });
  watch.observe([reused], NOW + 40_000);
  expect(watch.busyAt(reused)).toBeNull();
  expect(watch.busyAt(p)).toBeNull();
  expect(new CpuWatch().observe([proc({ cpuPercent: 40 })], NOW)).toBeUndefined();
  const busyAtFirstLook = new CpuWatch();
  busyAtFirstLook.observe([proc({ cpuPercent: 40 })], NOW);
  expect(busyAtFirstLook.busyAt(proc())).toBe(NOW);
});
