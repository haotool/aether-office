import type { Agent, Layout } from '@aether/contracts';
import { defaultLayout } from '@aether/office-scene';

export type LocalSession = {
  key: string;
  provider: 'claude' | 'codex';
  sessionId: string;
  cwd: string;
  repo: string;
  mtime: number;
  git: {
    branch: string | null;
    upstream: string | null;
    ahead: number;
    behind: number;
    uncommitted: number;
  } | null;
};
export type LocalSessionsResponse = { enabled: boolean; sessions: LocalSession[] };

const SPECIES = ['fox', 'cat', 'rabbit', 'bear', 'otter', 'raccoon', 'panda', 'dog'] as const;
const WORKING_MS = 2 * 60 * 1000;
export const LOCAL_PREFIX = 'local:';
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;

// Observed sessions are never "managed": provider=observe, mode=observe. Activity is a heuristic from file mtime only.
export function sessionsToAgents(
  sessions: readonly LocalSession[],
  projectId: string,
  now = Date.now(),
): Agent[] {
  return sessions
    .map(
      (s, i) =>
        ({
          id: `${LOCAL_PREFIX}${s.key}`,
          projectId,
          name: s.repo.slice(0, 24),
          role: `${s.provider}${s.git?.branch ? ` · ${s.git.branch}` : ''}`.slice(0, 80),
          provider: 'observe',
          mode: 'observe',
          species: SPECIES[hue(s.key) % SPECIES.length]!,
          color: `hsl(${hue(s.repo)} 70% 62%)`,
          activity: now - s.mtime < WORKING_MS ? 'working' : 'idle',
          version: 1,
          createdAt: s.mtime,
          lastSeen: s.mtime,
        }) satisfies Agent,
    )
    .map((a, i) => ({ ...a, name: a.name || `session-${i}` }));
}

// Give extra agents desks without disturbing a saved layout; unseated agents get new desks beyond existing ones.
export function mergeLayout(
  layout: Layout | null,
  managed: readonly Agent[],
  observed: readonly Agent[],
): Layout | null {
  if (!observed.length) return layout;
  const all = [...managed, ...observed];
  if (!layout) return defaultLayout(all);
  const seated = new Set(layout.objects.flatMap((o) => (o.agentId ? [o.agentId] : [])));
  const extra = defaultLayout(all).objects.filter(
    (o) => o.type === 'desk' && o.agentId && !seated.has(o.agentId),
  );
  const used = new Set(layout.objects.map((o) => o.id));
  return {
    ...layout,
    objects: [
      ...layout.objects,
      ...extra.map((o) => ({ ...o, id: used.has(o.id) ? `${o.id}-obs` : o.id })),
    ],
  };
}
