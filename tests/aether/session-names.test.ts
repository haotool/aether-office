import { expect, it } from 'vitest';
import { labelOf, tagOf } from '../../apps/web/src/lib/sessions/session-names.js';
import { sessionsToAgents } from '../../apps/web/src/lib/sessions/localSessions.js';

const session = (cwd: string, title: string | null = null) =>
  ({
    key: 'claude:88ac0000',
    provider: 'claude',
    sessionId: '88ac0000',
    cwd,
    repo: 'ledger-api',
    mtime: 0,
    title,
    subagents: [],
    hook: null,
    git: null,
    worktree: null,
    process: 'none',
    liveness: { state: 'ended', startedAt: null, quietMs: null, zombies: [] },
    classification: { role: 'release', department: 'platform', confidence: 0.6, evidence: [] },
  }) as never;

it('names an untitled worktree session by what sets its directory apart', () => {
  const [linked] = sessionsToAgents([session('/t/ledger-api-w1119')], 'p', 0);
  expect(linked!.name).toBe('w1119');
  expect(sessionsToAgents([session('/t/ledger-api')], 'p', 0)[0]!.name).toBe('ledger-api');
  expect(sessionsToAgents([session('/t/x', 'Fix login')], 'p', 0)[0]!.name).toBe('Fix login');
});

it('names a member by a short balanced label, never by its id prefix, and keeps the id for the tooltip', () => {
  const reported =
    '【審查邊界（擁有者 10-05, 程式碼審查, 離線）】 檢查 confirm-rate 的有效設定與回歸風險分析';
  const [agent] = sessionsToAgents([session('/t/x', reported)], 'p', 0);
  expect(agent!.name).toBe('【審查邊界】…');
  expect(agent!.name).not.toMatch(/cl·|cx·/);
  expect(tagOf(session('/t/x') as never)).toBe('cl·88ac');
  expect(labelOf({ cwd: '/t/x', repo: 'r', title: 'cx·01a1 Fix the login' })).toBe('Fix the login');
});

it('colors a member by its session, so a retitled session keeps its color', () => {
  const color = (title: string) => sessionsToAgents([session('/t/x', title)], 'p', 0)[0]!.color;
  expect(color('One')).toBe(color('Two'));
});

it('says in the role line when a session is dormant or orphaned, or has zombies under it', () => {
  const as = (state: string, zombies = 0) =>
    ({
      ...(session('/t/x') as object),
      liveness: {
        state,
        startedAt: null,
        quietMs: null,
        zombies: Array.from({ length: zombies }, (_, pid) => ({
          pid,
          startedAt: 0,
          program: null,
        })),
      },
    }) as never;
  expect(sessionsToAgents([as('dormant')], 'p', 0)[0]!.role).toMatch(/ · 休眠$/);
  expect(sessionsToAgents([as('orphaned')], 'p', 0, 'en')[0]!.role).toMatch(/ · orphaned$/);
  expect(sessionsToAgents([as('active', 2)], 'p', 0)[0]!.role).toMatch(/ · 殭屍 ×2$/);
  expect(sessionsToAgents([as('active')], 'p', 0)[0]!.role).not.toMatch(/休眠|孤兒|殭屍/);
});
