import { describe, expect, it } from 'vitest';
import type { AttributedSession, Snapshot } from '../../packages/contracts/src/index.js';
import { DAY_MS } from '../../packages/kernel/src/index.js';
import {
  formatMemory,
  idleMs,
  idleSessions,
  memoryOf,
  stillGone,
} from '../../apps/web/src/features/clock-out.js';
import {
  needsYou,
  sessionsNeedingYou,
  sessionsWaiting,
} from '../../apps/web/src/features/needs-you.js';
import { heldByOther, isNetworkError } from '../../apps/web/src/features/terminal-driver.js';
import { sessionIdOf, sessionLink, tagOf } from '../../apps/web/src/session-names.js';
import { pageLink } from '../../apps/web/src/nav.js';

const NOW = 50 * DAY_MS;
const session = (over: Record<string, unknown> = {}): AttributedSession =>
  ({
    key: 'claude:abcd1234',
    provider: 'claude',
    sessionId: 'abcd1234',
    mtime: NOW,
    hook: null,
    process: 'running',
    resources: null,
    projectId: null,
    liveness: { state: 'dormant', startedAt: 1000, quietMs: 2 * DAY_MS, zombies: [] },
    ...over,
  }) as unknown as AttributedSession;
const quiet = (key: string, days: number, over: Record<string, unknown> = {}) =>
  session({
    key,
    liveness: { state: 'dormant', startedAt: 1000, quietMs: days * DAY_MS, zombies: [] },
    ...over,
  });

describe('clock out: who may be sent home', () => {
  it('offers only running, forgotten or ownerless sessions idle for the chosen days, longest first', () => {
    const list = [
      quiet('claude:a', 2),
      quiet('claude:b', 9),
      quiet('claude:c', 5, { process: 'none' }),
      quiet('claude:d', 4, {
        liveness: { state: 'idle', startedAt: 1, quietMs: 4 * DAY_MS, zombies: [] },
      }),
      quiet('claude:e', 4, {
        liveness: { state: 'orphaned', startedAt: null, quietMs: 4 * DAY_MS, zombies: [] },
      }),
    ];
    expect(idleSessions(list, 1).map((s) => s.key)).toEqual(['claude:b', 'claude:a']);
    expect(idleSessions(list, 3).map((s) => s.key)).toEqual(['claude:b']);
    expect(idleSessions(list, 7).map((s) => s.key)).toEqual(['claude:b']);
    expect(idleMs(7)).toBe(7 * DAY_MS);
  });

  it('sums only the memory it measured, and says how many that was', () => {
    const list = [
      session({ resources: { rssBytes: 500e6 } }),
      session({ resources: null }),
      session({ resources: { rssBytes: 1.2e9 } }),
    ];
    expect(memoryOf(list)).toEqual({ bytes: 1.7e9, known: 2 });
    expect(memoryOf([])).toEqual({ bytes: 0, known: 0 });
    expect(formatMemory(480e6)).toBe('480 MB');
    expect(formatMemory(1.34e9)).toBe('1.3 GB');
    expect(formatMemory(10)).toBe('1 MB');
  });

  it('brings a member back to its desk once its session has been resumed', () => {
    const leaving = { 'local:claude:a': 5000, 'local:claude:b': 5000 };
    const sessions = [
      session({
        key: 'claude:a',
        liveness: { state: 'active', startedAt: 9000, quietMs: 0, zombies: [] },
      }),
      session({
        key: 'claude:b',
        liveness: { state: 'dormant', startedAt: 1000, quietMs: 9, zombies: [] },
      }),
    ];
    expect(stillGone(leaving, sessions)).toEqual({ 'local:claude:b': 5000 });
  });
});

describe('what needs a person', () => {
  const snapshot = {
    work: [{ state: 'reviewing' }, { state: 'done' }, { state: 'failed' }, { state: 'working' }],
    messages: [
      { kind: 'request', deliveries: [{ acknowledgedAt: null }] },
      { kind: 'request', deliveries: [{ acknowledgedAt: 5 }] },
      { kind: 'note', deliveries: [{ acknowledgedAt: null }] },
    ],
  } as unknown as Snapshot;

  it('counts the work and messages that wait for a person, not how many exist', () => {
    expect(needsYou(snapshot, 2, 3)).toEqual({ tasks: 2, messages: 1, approvals: 2, sessions: 3 });
    expect(needsYou(undefined, 0, 0)).toEqual({ tasks: 0, messages: 0, approvals: 0, sessions: 0 });
  });

  it('counts a session once even when it both waits on a prompt and asks here', () => {
    expect(sessionsNeedingYou([{ key: 'a' }, { key: 'b' }], new Set(['b', 'c']))).toBe(3);
  });

  it('lists the sessions stopped on a permission prompt', () => {
    const waiting = session({
      key: 'claude:w',
      hook: { activity: 'waiting_permission', at: NOW, recent: [], lastEvent: 'e', tool: null },
    });
    expect(sessionsWaiting([waiting, session()], NOW).map((s) => s.key)).toEqual(['claude:w']);
    expect(sessionsWaiting(undefined, NOW)).toEqual([]);
  });
});

describe('terminal control', () => {
  const control = (controlOwner: string | null, leaseUntil: number | null) =>
    ({ controlOwner, leaseUntil }) as Parameters<typeof heldByOther>[0];

  it('is held by another person only while their lease runs', () => {
    expect(heldByOther(control('them', NOW + 1), 'me', NOW)).toBe(true);
    expect(heldByOther(control('them', NOW), 'me', NOW)).toBe(false); // expired
    expect(heldByOther(control('them', null), 'me', NOW)).toBe(false);
    expect(heldByOther(control('me', NOW + 1), 'me', NOW)).toBe(false);
    expect(heldByOther(control(null, null), 'me', NOW)).toBe(false);
  });

  it('tells a network failure from an answer', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('TERMINAL_NOT_RUNNING'))).toBe(false);
  });
});

describe('addresses and ids', () => {
  it('keeps the open project in a page link', () => {
    expect(pageLink('tasks', 'p1')).toBe('/tasks?project=p1');
    expect(pageLink('tasks', undefined)).toBe('/tasks');
  });

  it('round-trips a session id through its office member id, subagents included', () => {
    expect(sessionIdOf('local:claude:abc')).toBe('claude:abc');
    expect(sessionIdOf('agent-7')).toBeNull();
  });

  it('opens a session focused, with its project when it has one', () => {
    const link = sessionLink({ key: 'claude:abc', projectId: 'p 1' });
    expect(link).toBe('/office?project=p 1&agent=local%3Aclaude%3Aabc&focus=1');
    expect(sessionLink({ key: 'codex:x', projectId: null })).toBe(
      '/office?agent=local%3Acodex%3Ax&focus=1',
    );
  });

  it('shows the technical id as provider and four characters', () => {
    expect(tagOf({ provider: 'codex', sessionId: '01a1ffff' })).toBe('cx·01a1');
    expect(tagOf({ provider: 'claude', sessionId: 'zzzz9' })).toBe('cl·zzzz');
  });
});
