import { expect, it } from 'vitest';
import { sessionsToAgents } from '../../apps/web/src/localSessions.js';

const session = (cwd: string, title: string | null = null) =>
  ({
    key: 'claude:88ac0000',
    provider: 'claude',
    sessionId: '88ac0000',
    cwd,
    repo: 'accounting-bunny',
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
  const [linked] = sessionsToAgents([session('/t/accounting-bunny-w1119')], 'p', 0);
  expect(linked!.name).toBe('cl·88ac w1119');
  expect(sessionsToAgents([session('/t/accounting-bunny')], 'p', 0)[0]!.name).toBe(
    'cl·88ac accounting-bunny',
  );
  expect(sessionsToAgents([session('/t/x', 'Fix login')], 'p', 0)[0]!.name).toBe(
    'cl·88ac Fix login',
  );
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
