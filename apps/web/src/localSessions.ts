import type { Agent, Layout, LocalSession } from '@aether/contracts';
import { defaultLayout } from '@aether/office-scene';
import { ROLE_LABELS, type Classification } from '@aether/kernel';

const SPECIES = ['fox', 'cat', 'rabbit', 'bear', 'otter', 'raccoon', 'panda', 'dog'] as const;
const WORKING_MS = 2 * 60 * 1000;
const GONE_MS = 10 * 60 * 1000;
const LOCAL_PREFIX = 'local:';
const SUBAGENT_INFIX = ':sub:';

const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? '';
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;

export const sessionIdOf = (agentId: string): string | null =>
  agentId.startsWith(LOCAL_PREFIX)
    ? agentId.slice(LOCAL_PREFIX.length).split(SUBAGENT_INFIX)[0]!
    : null;

export function activityOf(session: LocalSession, now: number): Agent['activity'] {
  // Hook events are authoritative when installed; otherwise the process table, then a file-mtime heuristic.
  if (session.hook?.activity === 'ended') return 'offline';
  // A hook state is only as fresh as its last event: with no process behind it, a long-silent one is stale.
  if (session.hook && session.process === 'none' && now - session.hook.at > GONE_MS)
    return 'offline';
  if (session.hook?.activity === 'waiting_permission') return 'waiting_permission';
  if (session.hook) return session.hook.activity === 'working' ? 'working' : 'idle';
  // No process: a recently written file is a finished session, not work, and a long-quiet one is gone.
  if (session.process === 'none') return now - session.mtime < GONE_MS ? 'idle' : 'offline';
  return now - session.mtime < WORKING_MS ? 'working' : 'idle';
}

function observed(
  id: string,
  name: string,
  role: string,
  seed: string,
  activity: Agent['activity'],
  at: number,
  projectId: string,
): Agent {
  return {
    id,
    projectId,
    name: name.slice(0, 24),
    role: role.slice(0, 80),
    provider: 'observe',
    mode: 'observe',
    species: SPECIES[hue(seed) % SPECIES.length]!,
    color: `hsl(${hue(name)} 70% 62%)`,
    activity,
    version: 1,
    createdAt: at,
    lastSeen: at,
  };
}

// Observed sessions are never "managed" (provider/mode = observe). Each live subagent is its own
// character whose role names its parent session, so child work stays attributed to the right project.
export const classificationOf = (s: LocalSession): Classification =>
  s.classification as Classification;

export function sessionsToAgents(
  sessions: readonly LocalSession[],
  projectId: string,
  now = Date.now(),
  locale: 'zh-TW' | 'en' = 'zh-TW',
): Agent[] {
  return sessions.flatMap((s) => {
    const kind = classificationOf(s);
    const roleName = ROLE_LABELS[kind.role][locale === 'zh-TW' ? 'zh' : 'en'];
    const branch = s.git?.branch ? ` · ${s.git.branch}` : '';
    const worktree = s.worktree?.linked ? ' · worktree' : '';
    // Many sessions share a repository: the directory and a short id tell their characters apart.
    const tag = `${s.provider === 'codex' ? 'cx' : 'cl'}·${s.sessionId.slice(0, 4)}`;
    const parent = observed(
      `${LOCAL_PREFIX}${s.key}`,
      `${tag} ${s.title ?? (basename(s.cwd) || s.repo)}`,
      `${roleName} · ${s.provider}${branch}${worktree}`,
      s.key,
      activityOf(s, now),
      s.mtime,
      projectId,
    );
    const children = s.subagents.map((c) =>
      observed(
        `${LOCAL_PREFIX}${s.key}${SUBAGENT_INFIX}${c.id}`,
        c.type,
        `subagent of ${s.repo}${worktree}`,
        c.id,
        'working',
        c.lastSeen,
        projectId,
      ),
    );
    return [parent, ...children];
  });
}

// Give extra agents desks without disturbing a saved layout; unseated agents get new desks beyond existing ones.
export function mergeLayout(
  layout: Layout | null,
  managed: readonly Agent[],
  extra: readonly Agent[],
): Layout | null {
  if (!extra.length) return layout;
  const all = [...managed, ...extra];
  if (!layout) return defaultLayout(all);
  const seated = new Set(layout.objects.flatMap((o) => (o.agentId ? [o.agentId] : [])));
  const used = new Set(layout.objects.map((o) => o.id));
  const desks = defaultLayout(all).objects.filter(
    (o) => o.type === 'desk' && o.agentId && !seated.has(o.agentId),
  );
  return {
    ...layout,
    objects: [
      ...layout.objects,
      ...desks.map((o) => ({ ...o, id: used.has(o.id) ? `${o.id}-obs` : o.id })),
    ],
  };
}
