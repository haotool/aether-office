import type { Agent, Layout, LocalSession } from '@aether/contracts';
import {
  FLOORS,
  FLOOR_CAPACITY,
  apparitionOf,
  defaultLayout,
  seatAt,
  type Apparition,
} from '@aether/office-scene/model';
import { DEPARTMENTS, ROLE_LABELS, classifySession, type Classification } from '@aether/kernel';

const SPECIES = ['fox', 'cat', 'rabbit', 'bear', 'otter', 'raccoon', 'panda', 'dog'] as const;
const WORKING_MS = 2 * 60 * 1000;
const GONE_MS = 10 * 60 * 1000;
export const LOCAL_PREFIX = 'local:';
export const SUBAGENT_INFIX = ':sub:';

const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? '';
// Names are cut to 24 characters, so an untitled session in a worktree named after its repository is named by what
// sets the worktree apart (`accounting-bunny-w1119` → `w1119`); the repository is the project it is shown in.
const place = (s: Pick<LocalSession, 'cwd' | 'repo'>) => {
  const dir = basename(s.cwd) || s.repo;
  return dir.startsWith(`${s.repo}-`) ? dir.slice(s.repo.length + 1) : dir;
};
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

const NOTE = {
  dormant: { 'zh-TW': '休眠', en: 'dormant' },
  orphaned: { 'zh-TW': '孤兒', en: 'orphaned' },
} as const;
/** How the member is alive, when that is worth saying: appended to its role line. */
const noteOf = (s: Pick<LocalSession, 'liveness'>, locale: 'zh-TW' | 'en') => {
  const state =
    s.liveness.state in NOTE ? ` · ${NOTE[s.liveness.state as keyof typeof NOTE][locale]}` : '';
  const zombies = s.liveness.zombies.length
    ? ` · ${locale === 'zh-TW' ? '殭屍' : 'zombies'} ×${s.liveness.zombies.length}`
    : '';
  return state + zombies;
};

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
      `${tag} ${s.title ?? place(s)}`,
      `${roleName} · ${s.provider}${branch}${worktree}${noteOf(s, locale)}`,
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

const floorOfDepartment = (id: string) => DEPARTMENTS.find((d) => d.id === id)?.floor ?? 0;

/**
 * Which floor an agent works on: an observed session by the department it was classified into (its subagents with
 * it), a managed agent by what its role says.
 */
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

/**
 * Seats every agent the saved layout has no desk for, on the agent's own floor, in the first free slot. A saved
 * layout is never rearranged. With no saved layout the whole building is generated.
 */
export function mergeLayout(
  layout: Layout | null,
  managed: readonly Agent[],
  extra: readonly Agent[],
  floorOf: (agent: Agent) => number = () => 0,
): Layout | null {
  const all = [...managed, ...extra];
  if (!layout) return extra.length ? defaultLayout(all, floorOf) : null;
  const seated = new Set(layout.objects.flatMap((o) => (o.agentId ? [o.agentId] : [])));
  const added: Layout['objects'] = [];
  const next = new Map<number, number>();
  const taken = (floor: number, x: number, z: number) =>
    [...layout.objects, ...added].some(
      (o) => (o.floor ?? 0) === floor && Math.abs(o.x - x) < 2.4 && Math.abs(o.z - z) < 2.2,
    );
  for (const agent of all) {
    if (seated.has(agent.id)) continue;
    const floor = Math.min(FLOORS - 1, Math.max(0, floorOf(agent)));
    let slot = next.get(floor) ?? 0;
    while (slot < FLOOR_CAPACITY && taken(floor, ...seatAt(slot))) slot++;
    if (slot >= FLOOR_CAPACITY) continue; // a full floor: the agent has no desk, as before
    next.set(floor, slot + 1);
    const [x, z] = seatAt(slot);
    added.push({
      id: `desk-obs-${floor}-${slot}`,
      type: 'desk',
      x,
      z,
      rotation: 0,
      agentId: agent.id,
      floor,
    });
  }
  return added.length ? { ...layout, objects: [...layout.objects, ...added] } : layout;
}

/** The role id an agent's screen and floor are chosen by: an observed session's classification, else its role text. */
export function roleResolver(sessions: readonly LocalSession[]): (agent: Agent) => string {
  const byKey = new Map(sessions.map((s) => [s.key, s.classification.role]));
  return (agent) => {
    const key = sessionIdOf(agent.id);
    return (key !== null && byKey.get(key)) || classifySession({ title: agent.role }).role;
  };
}

/** The Git branch behind an observed agent, for the beams in the office; managed agents have none here. */
export function branchResolver(sessions: readonly LocalSession[]) {
  const byKey = new Map(sessions.map((s) => [s.key, s]));
  return (agent: Agent) => {
    const key = sessionIdOf(agent.id);
    const s = key === null ? undefined : byKey.get(key);
    if (!s?.git) return null;
    return {
      branch: s.git.branch,
      linked: !!s.worktree?.linked,
      dirty: s.git.uncommitted,
      ahead: s.git.ahead,
      behind: s.git.behind,
    };
  };
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** The provider's own commands to continue or branch off a session, run from the session's directory. */
export function sessionCommands(s: Pick<LocalSession, 'provider' | 'sessionId' | 'cwd'>) {
  const cd = `cd ${quote(s.cwd)} && `;
  return s.provider === 'claude'
    ? {
        resume: `${cd}claude --resume ${s.sessionId}`,
        fork: `${cd}claude --resume ${s.sessionId} --fork-session`,
      }
    : { resume: `${cd}codex resume ${s.sessionId}`, fork: `${cd}codex fork ${s.sessionId}` };
}

/** Pure. Tokens each department's sessions have used, largest first; sessions that report no usage are left out. */
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

/** A span of time as a person reads it: "3 分鐘", "14 小時", "2 天". Rounded down, never zero. */
export function formatSpan(ms: number, locale: 'zh-TW' | 'en' = 'zh-TW'): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const [n, zh, en] =
    minutes < 60
      ? [minutes, '分鐘', 'min']
      : minutes < 48 * 60
        ? [Math.floor(minutes / 60), '小時', 'h']
        : [Math.floor(minutes / 1440), '天', 'd'];
  return locale === 'zh-TW' ? `${n} ${zh}` : `${n} ${en}`;
}

/** Sessions worth a person's attention for how they are alive: forgotten, ownerless, or with zombies under them. */
export const needsAttention = (s: Pick<LocalSession, 'liveness'>) =>
  ['dormant', 'orphaned'].includes(s.liveness.state) || s.liveness.zombies.length > 0;

/** Which sessions are drawn as a sleeping rabbit or a ghost in place of the member, by the id of that member. */
export function apparitionsOf(
  sessions: readonly LocalSession[],
): Record<string, Exclude<Apparition, 'zombie'>> {
  return Object.fromEntries(
    sessions.flatMap((s) => {
      const form = apparitionOf(s.liveness.state);
      return form ? [[`${LOCAL_PREFIX}${s.key}`, form] as const] : [];
    }),
  );
}

/** Which members have zombie processes under them, and how many. */
export function zombiesOf(sessions: readonly LocalSession[]): Record<string, number> {
  return Object.fromEntries(
    sessions.flatMap((s) =>
      s.liveness.zombies.length
        ? [[`${LOCAL_PREFIX}${s.key}`, s.liveness.zombies.length] as const]
        : [],
    ),
  );
}

/**
 * Why a session wants a person, in a few words: "休眠 27 小時", "孤兒", "殭屍 ×2 (node, sh)". Null when it does not.
 * Pure; the same words label the director's shot of it and the row in the attention list.
 */
export function attentionReason(
  s: Pick<LocalSession, 'liveness'>,
  locale: 'zh-TW' | 'en' = 'zh-TW',
): string | null {
  const zh = locale === 'zh-TW';
  const parts: string[] = [];
  const { state, quietMs, zombies } = s.liveness;
  if (state === 'dormant' || state === 'orphaned') {
    const name = NOTE[state][locale];
    parts.push(quietMs !== null ? `${name} ${formatSpan(quietMs, locale)}` : name);
  }
  if (zombies.length) {
    const programs = [...new Set(zombies.map((z) => z.program).filter(Boolean))].slice(0, 3);
    parts.push(
      `${zh ? '殭屍' : 'zombies'} ×${zombies.length}${programs.length ? ` (${programs.join(', ')})` : ''}`,
    );
  }
  return parts.length ? parts.join(' · ') : null;
}

/** The members that want a person, by id, with the reason: what the director's attention shots are made of. */
export function attentionOf(
  sessions: readonly LocalSession[],
  locale: 'zh-TW' | 'en',
): Record<string, string> {
  return Object.fromEntries(
    sessions.flatMap((s) => {
      const reason = attentionReason(s, locale);
      return reason ? [[`${LOCAL_PREFIX}${s.key}`, reason] as const] : [];
    }),
  );
}
