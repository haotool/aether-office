import { type Agent, type LocalSession } from '@aether/contracts';
import { SUBAGENT_INFIX } from '../../lib/sessions/subagent-id.js';
import {
  DEPARTMENTS,
  ROLE_LABELS,
  classifySession,
  roleOfSubagent,
  shQuote,
  shortLabel,
  type Classification,
} from '@aether/kernel';
import { activityOf, noteOf } from './session-attention.js';
import { LOCAL_PREFIX, NAME_WIDTH, labelOf, sessionIdOf } from './session-names.js';

const SPECIES = ['fox', 'cat', 'rabbit', 'bear', 'otter', 'raccoon', 'panda', 'dog'] as const;

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
function observed(
  id: string,
  name: string,
  role: string,
  seed: string,
  activity: Agent['activity'],
  at: number,
  projectId: string,
): Agent {
  const species = SPECIES[hue(seed) % SPECIES.length];
  if (species === undefined) throw new Error('species palette empty');
  return {
    id,
    projectId,
    name,
    role: role.slice(0, 80),
    provider: 'observe',
    mode: 'observe',
    species,
    color: `hsl(${hue(seed)} 70% 62%)`,
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

const KERNEL_LANGUAGE = { 'zh-TW': 'zh', en: 'en' } as const;

export function sessionsToAgents(
  sessions: readonly LocalSession[],
  projectId: string,
  now = Date.now(),
  locale: 'zh-TW' | 'en' = 'zh-TW',
): Agent[] {
  return sessions.flatMap((s) => {
    const kind = classificationOf(s);
    const roleName = ROLE_LABELS[kind.role][KERNEL_LANGUAGE[locale]];
    const branch = s.git?.branch ? ` · ${s.git.branch}` : '';
    const worktree = s.worktree?.linked ? ' · worktree' : '';
    const parent = observed(
      `${LOCAL_PREFIX}${s.key}`,
      labelOf(s),
      `${roleName} · ${s.provider}${branch}${worktree}${noteOf(s, locale)}`,
      s.key,
      activityOf(s, now),
      s.mtime,
      projectId,
    );
    const children = s.subagents
      .filter((c) => c.status !== 'finished')
      .map((c) =>
        observed(
          `${LOCAL_PREFIX}${s.key}${SUBAGENT_INFIX}${c.id}`,
          shortLabel(c.type, { maxWidth: NAME_WIDTH }),
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

const floorOfDepartment = (id: string) => DEPARTMENTS.find((d) => d.id === id)?.floor ?? 0;

export function floorResolver(sessions: readonly LocalSession[]): (agent: Agent) => number {
  const byKey = new Map(
    sessions.map((s) => [s.key, floorOfDepartment(s.classification.department)]),
  );
  return (agent) => {
    const key = sessionIdOf(agent.id);
    if (key !== null) return byKey.get(key) ?? 0;
    return floorOfDepartment(classifySession({ title: agent.role }).department);
  };
}

export function roleResolver(sessions: readonly LocalSession[]): (agent: Agent) => string {
  const byKey = new Map(sessions.map((s) => [s.key, s]));
  return (agent) => {
    const key = sessionIdOf(agent.id);
    const session = key === null ? undefined : byKey.get(key);
    if (!session) return classifySession({ title: agent.role }).role;
    const childId = agent.id.split(SUBAGENT_INFIX)[1];
    const type = childId ? session.subagents.find((c) => c.id === childId)?.type : undefined;
    return (type && roleOfSubagent(type)) || session.classification.role;
  };
}

export function branchResolver(sessions: readonly LocalSession[]) {
  const byKey = new Map(sessions.map((s) => [s.key, s]));
  return (agent: Agent) => {
    const key = sessionIdOf(agent.id);
    const s = key === null ? undefined : byKey.get(key);
    if (!s?.git) return null;
    return {
      repo: s.repo,
      branch: s.git.branch,
      linked: !!s.worktree?.linked,
      dirty: s.git.uncommitted,
      ahead: s.git.ahead,
      behind: s.git.behind,
    };
  };
}

export function sessionCommands(s: Pick<LocalSession, 'provider' | 'sessionId' | 'cwd'>) {
  const cd = `cd ${shQuote(s.cwd)} && `;
  return s.provider === 'claude'
    ? {
        resume: `${cd}claude --resume ${s.sessionId}`,
        fork: `${cd}claude --resume ${s.sessionId} --fork-session`,
      }
    : { resume: `${cd}codex resume ${s.sessionId}`, fork: `${cd}codex fork ${s.sessionId}` };
}

export function tokensByDepartment(
  sessions: readonly (Pick<LocalSession, 'usage'> & { classification: { department: string } })[],
) {
  const totals = new Map<string, { tokens: number; sessions: number }>();
  for (const s of sessions) {
    if (s.usage.freshTokens === null) continue;
    const t = totals.get(s.classification.department) ?? { tokens: 0, sessions: 0 };
    totals.set(s.classification.department, {
      tokens: t.tokens + s.usage.freshTokens,
      sessions: t.sessions + 1,
    });
  }
  return [...totals]
    .map(([department, t]) => ({ department, ...t }))
    .sort((a, b) => b.tokens - a.tokens);
}
