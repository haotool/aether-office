import { expect, it } from 'vitest';
import {
  SESSION_ACTIVE_MS,
  SESSION_GONE_MS,
  type LocalSession,
} from '../../packages/contracts/src/index.js';
import { activityOf } from '../../apps/web/src/lib/sessions/session-attention.js';
import { localSession } from './session-fixtures.js';

const NOW = 10_000_000;
const session = (over: Partial<LocalSession>) => localSession({ mtime: NOW - 30_000, ...over });
const hook = (activity: 'working' | 'idle' | 'waiting_permission' | 'ended', at = NOW) => ({
  activity,
  lastEvent: 'e',
  tool: null,
  at,
  recent: [],
});

it('derives activity from hooks first, then the process table, then file age, and never invents work', () => {
  expect(activityOf(session({ hook: hook('working'), process: 'none' }), NOW)).toBe('working');
  expect(activityOf(session({ hook: hook('idle') }), NOW)).toBe('idle');
  expect(activityOf(session({ hook: hook('waiting_permission'), process: 'running' }), NOW)).toBe(
    'waiting_permission',
  );
  expect(activityOf(session({ hook: hook('ended') }), NOW)).toBe('offline');
  // a stale hook state whose process is gone must not stay 'working' forever (Stop never arrived)
  const stale = hook('working', NOW - 11 * 60_000);
  expect(activityOf(session({ hook: stale, process: 'none' }), NOW)).toBe('offline');
  expect(activityOf(session({ hook: stale, process: 'running' }), NOW)).toBe('working');
  expect(activityOf(session({ process: 'running' }), NOW)).toBe('working');
  expect(activityOf(session({ process: 'unknown' }), NOW)).toBe('working');
  expect(activityOf(session({ process: 'none' }), NOW)).toBe('idle');
  expect(activityOf(session({ process: 'none', mtime: NOW - 11 * 60_000 }), NOW)).toBe('offline');
  expect(activityOf(session({ process: 'running', mtime: NOW - 11 * 60_000 }), NOW)).toBe('idle');
});

it('shares its thresholds with the server: the working window and the gone window sit on the same constants', () => {
  const edge = (over: Partial<LocalSession>, ms: number) =>
    activityOf(session({ ...over, mtime: NOW - ms }), NOW);
  const rows: [LocalSession['process'], number, string][] = [
    ['running', SESSION_ACTIVE_MS - 1, 'working'],
    ['running', SESSION_ACTIVE_MS, 'idle'],
    ['none', SESSION_GONE_MS - 1, 'idle'],
    ['none', SESSION_GONE_MS, 'offline'],
  ];
  for (const [process, ms, expected] of rows) expect(edge({ process }, ms)).toBe(expected);
  expect(SESSION_ACTIVE_MS).toBe(120_000);
  expect(SESSION_GONE_MS).toBe(600_000);
});
