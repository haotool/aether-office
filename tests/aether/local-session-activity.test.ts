import { expect, it } from 'vitest';
import type { LocalSession } from '../../packages/contracts/src/index.js';
import { activityOf } from '../../apps/web/src/localSessions.js';

const NOW = 10_000_000;
const session = (over: Partial<LocalSession>): LocalSession => ({
  key: 'claude:s',
  provider: 'claude',
  sessionId: 's',
  cwd: '/x',
  repo: 'x',
  mtime: NOW - 30_000,
  git: null,
  worktree: null,
  hook: null,
  subagents: [],
  process: 'unknown',
  resources: null,
  ports: [],
  title: null,
  classification: { role: 'generalist', department: 'product', basis: 'default', matched: null },
  usage: { model: null, contextTokens: null, contextWindow: null, totalTokens: null, limit: null },
  ...over,
});
const hook = (activity: 'working' | 'idle' | 'waiting_permission' | 'ended', at = NOW) => ({
  activity,
  lastEvent: 'e',
  tool: null,
  at,
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
  // without hooks: a fresh file with a running or unknown process looks like work…
  expect(activityOf(session({ process: 'running' }), NOW)).toBe('working');
  expect(activityOf(session({ process: 'unknown' }), NOW)).toBe('working');
  // …but with no process it is a finished session, and after ten quiet minutes it is gone.
  expect(activityOf(session({ process: 'none' }), NOW)).toBe('idle');
  expect(activityOf(session({ process: 'none', mtime: NOW - 11 * 60_000 }), NOW)).toBe('offline');
  expect(activityOf(session({ process: 'running', mtime: NOW - 11 * 60_000 }), NOW)).toBe('idle');
});
