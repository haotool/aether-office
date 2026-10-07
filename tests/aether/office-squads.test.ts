import { expect, it } from 'vitest';
import type { AttributedSession, Subagent } from '../../packages/contracts/src/index.js';
import { subagentSchema } from '../../packages/contracts/src/index.js';
import { officeModel, squadsOf } from '../../apps/web/src/features/office-model.js';
import { sessionsToAgents } from '../../apps/web/src/localSessions.js';

const child = (over: Partial<Subagent> & { id: string }): Subagent =>
  subagentSchema.parse({ type: 'Explore', lastSeen: Date.now(), status: 'running', ...over });

const session = (key: string, subagents: Subagent[]) =>
  ({
    key,
    provider: 'claude',
    sessionId: key,
    cwd: '/w/app',
    repo: 'app',
    mtime: Date.now(),
    git: null,
    worktree: null,
    hook: null,
    subagents,
    title: null,
    classification: { role: 'generalist', department: 'engineering', confidence: 0, evidence: [] },
    usage: {
      model: null,
      contextTokens: null,
      contextWindow: null,
      contextPct: null,
      compactedAt: null,
      freshTokens: null,
      limit: null,
    },
    process: 'running',
    resources: null,
    liveness: { state: 'active', startedAt: null, quietMs: null, zombies: [] },
    ports: [],
    projectId: 'p1',
  }) as AttributedSession;

it('groups subagents under their supervisor with status, times and tool facts; skips squads of none', () => {
  const squads = squadsOf([
    session('claude:a', [
      child({ id: 'x1', startedAt: 10, tools: { count: 4, last: 'Read', lastAt: 12 } }),
      child({
        id: 'x2',
        type: 'Plan',
        status: 'finished',
        startedAt: 11,
        endedAt: 20,
        result: { summary: 'Found 3 call sites', error: true, chars: 18 },
      }),
    ]),
    session('claude:b', []),
  ]);
  expect(squads).toEqual([
    {
      supervisor: 'local:claude:a',
      members: [
        expect.objectContaining({
          id: 'local:claude:a:sub:x1',
          type: 'Explore',
          status: 'running',
          startedAt: 10,
          endedAt: null,
          toolCount: 4,
          lastTool: 'Read',
          toolAt: 12,
          result: null,
        }),
        expect.objectContaining({
          id: 'local:claude:a:sub:x2',
          type: 'Plan',
          status: 'finished',
          endedAt: 20,
          toolCount: 0,
          lastTool: null,
          toolAt: null,
          result: { error: true }, // only the flag crosses into the scene, never the summary
        }),
      ],
    },
  ]);
});

it('draws tethers, pulses and desks only for subagents that are still working', () => {
  const s = session('claude:a', [
    child({ id: 'live' }),
    child({ id: 'waiting', status: 'waiting_permission' }),
    child({ id: 'done', status: 'finished', endedAt: Date.now() }),
  ]);
  const model = officeModel(undefined, [s], 'p1', 'en');
  expect(model.tethers.map((t) => t.child)).toEqual([
    'local:claude:a:sub:live',
    'local:claude:a:sub:waiting',
  ]);
  expect(model.pulses.map((p) => p.to)).toEqual([
    'local:claude:a:sub:live',
    'local:claude:a:sub:waiting',
  ]);
  const ids = sessionsToAgents([s], 'p1', Date.now(), 'en').map((a) => a.id);
  expect(ids).toEqual(['local:claude:a', 'local:claude:a:sub:live', 'local:claude:a:sub:waiting']);
  // squadsOf still reports the finished one, so a later scene can show its return.
  expect(squadsOf([s])[0]!.members).toHaveLength(3);
});
