import { expect, it } from 'vitest';
import type {
  Agent,
  AttributedSession,
  PermissionRequestView,
} from '../../packages/contracts/src/index.js';
import { buildFeed } from '../../apps/web/src/features/feed-model.js';
import { sessionsNeedingYou } from '../../apps/web/src/features/needs-you.js';
import {
  askingKeys,
  mustReview,
  requestsFor,
  secondsLeft,
} from '../../apps/web/src/features/permission-requests.js';
import { sessionTransitions } from '../../apps/web/src/alert-rules.js';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const request = (id: string, sessionKey: string, over: Partial<PermissionRequestView> = {}) => ({
  id,
  sessionKey,
  tool: 'Bash',
  summary: 'pnpm test',
  preview: null,
  needsReview: false,
  sessionRules: [],
  createdAt: NOW,
  expiresAt: NOW + 45_000,
  state: 'pending' as const,
  decidedAt: null,
  ...over,
});

it('picks pending requests per session, oldest first, and counts the seconds left', () => {
  const all = [
    request('b', 'claude:a', { createdAt: NOW + 2 }),
    request('a', 'claude:a'),
    request('c', 'claude:b', { state: 'allowed' }),
    request('d', 'claude:c'),
  ];
  expect(requestsFor(all, 'claude:a').map((r) => r.id)).toEqual(['a', 'b']);
  expect([...askingKeys(all)].sort()).toEqual(['claude:a', 'claude:c']);
  expect(secondsLeft(NOW + 44_100, NOW)).toBe(45);
  expect(secondsLeft(NOW - 1, NOW)).toBe(0);
});

it('a compact card offers Allow only when its one line is the whole call', () => {
  const multi = request('m', 'claude:a', { needsReview: true });
  expect(mustReview(multi, true, false)).toBe(true); // Review first, no Allow
  expect(mustReview(multi, true, true)).toBe(false); // once opened, the full card has the preview and Allow
  expect(mustReview(multi, false, false)).toBe(false); // the full card always shows the preview
  expect(mustReview(request('s', 'claude:a'), true, false)).toBe(false);
});

it('a session with a request waiting needs you, once, whatever its hooks last said', () => {
  const session = {
    key: 'claude:a',
    provider: 'claude',
    sessionId: 'a',
    cwd: '/w',
    repo: 'w',
    mtime: NOW - 1000,
    git: null,
    worktree: null,
    hook: {
      activity: 'working',
      lastEvent: 'PreToolUse',
      tool: 'Bash',
      at: NOW - 1000,
      recent: [],
    },
    subagents: [],
    title: null,
    usage: {},
    process: 'running',
    liveness: { state: 'active', startedAt: null, quietMs: null, zombies: [] },
    ports: [],
    projectId: 'p',
  } as unknown as AttributedSession;
  const agents = [
    { id: 'local:claude:a', name: 'a', species: 'fox', color: '#fff' },
  ] as unknown as Agent[];
  const base = { sessions: [session], agents, speech: {}, seen: {}, now: NOW };
  expect(buildFeed(base).needs).toHaveLength(0);
  const asked = buildFeed({ ...base, asking: new Set(['claude:a']) });
  expect(asked.needs.map((i) => [i.key, i.reason])).toEqual([['claude:a', 'permission']]);

  // The badge counts a session once, whether the hooks, the request or both say it waits.
  expect(sessionsNeedingYou([{ key: 'claude:a' }], new Set(['claude:a', 'claude:b']))).toBe(2);
  expect(sessionsNeedingYou([], new Set())).toBe(0);

  // And the alert for it is the existing "needs you" one.
  const before = new Map([['claude:a', { activity: 'working', since: 0 }]]);
  const { events } = sessionTransitions(
    before,
    [{ key: 'claude:a', activity: 'waiting_permission', project: 'w', to: '/' }],
    NOW,
  );
  expect(events.map((e) => e.kind)).toEqual(['needs-you']);
});
