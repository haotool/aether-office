import type { AttributedSession } from '../../packages/contracts/src/index.js';
import type { LifeSnapshot } from '../../apps/web/src/features/life-signals.js';

/** Scan fixtures for the signal deriver: a session as the control plane reports it, and a snapshot of several. */
export const NOW = 1_700_000_000_000;
export type Call = {
  tool: string;
  target: string | null;
  at: number;
  agentId?: string | null;
  tags?: string[];
  ok?: boolean | null;
};

export const session = (
  key: string,
  over: {
    recent?: Call[];
    activity?: 'working' | 'idle';
    tool?: string | null;
    hookAt?: number;
    startedAt?: number | null;
    quietMs?: number | null;
    state?: string;
    uncommitted?: number;
    conflicts?: number;
    repo?: string;
  } = {},
) =>
  ({
    key,
    provider: 'claude',
    sessionId: key,
    cwd: '/w',
    repo: over.repo ?? 'app',
    mtime: NOW,
    git: {
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      uncommitted: over.uncommitted ?? 0,
      conflicts: over.conflicts ?? 0,
    },
    worktree: null,
    hook: {
      activity: over.activity ?? 'working',
      lastEvent: 'PostToolUse',
      tool: over.tool ?? null,
      at: over.hookAt ?? NOW,
      recent: (over.recent ?? []).map((c) => ({ agentId: null, tags: [], ok: null, ...c })),
    },
    subagents: [],
    title: null,
    classification: { role: 'generalist', department: 'engineering', confidence: 0, evidence: [] },
    usage: {},
    process: 'running',
    resources: null,
    liveness: {
      state: over.state ?? 'active',
      startedAt: over.startedAt ?? null,
      quietMs: over.quietMs ?? null,
      zombies: [],
    },
    ports: [],
    projectId: 'p',
  }) as unknown as AttributedSession;

export const snap = (
  at: number,
  sessions: AttributedSession[],
  agents: LifeSnapshot['agents'] = [],
): LifeSnapshot => ({
  at,
  sessions,
  agents,
});
