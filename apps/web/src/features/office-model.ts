import type { Agent, LocalSessionsResponse, Snapshot, Subagent } from '@aether/contracts';
import { shortLabel } from '@aether/kernel';
import { translate, type Locale } from '../i18n.js';
import type { Pulse, ScreenFacts } from '@aether/office-scene/model';
import { intensityOf, type Intensity } from './activity-rate.js';
import type { ContextReading } from './compaction.js';
import { stillGone } from './clock-out.js';
import {
  LOCAL_PREFIX,
  SUBAGENT_INFIX,
  activityOf,
  apparitionsOf,
  attentionOf,
  branchResolver,
  floorResolver,
  roleResolver,
  sessionsToAgents,
  tagOf,
  zombiesOf,
} from '../localSessions.js';

type Sessions = LocalSessionsResponse['sessions'];

/** Columns a desk screen's title line gets before it is shortened. */
const SCREEN_TITLE_WIDTH = 40;

/** A subagent that has done something in the last half minute is still working for its parent. */
const SUBAGENT_LIVE_MS = 20_000;

/** A subagent that has not returned yet: the office seats it, tethers it and lets it pulse. */
const isWorking = (c: Subagent) => c.status !== 'finished';

/** What a squad member's facts are: everything the scene and the panel need, nothing they would have to derive. */
export type SquadMemberFacts = {
  id: string; // the member id, `local:<session>:sub:<id>`
  type: string;
  nickname: string | null;
  status: Subagent['status'];
  startedAt: number | null;
  endedAt: number | null;
  lastSeen: number;
  toolCount: number;
  lastTool: string | null;
  /** Tokens per minute from the subagent's transcript (Claude); null when no file gave a sample. The beam's rate. */
  tokensPerMinute: number | null;
  /** When it last started a tool; the scene's puppet strings jerk when it changes. */
  toolAt: number | null;
  /** What it handed back (only the error flag): the hand-over stamp reads it. Null while it runs or when unknown. */
  result: { error: boolean | null } | null;
};
/** A supervisor (its member id) and its subagents, finished ones included until the server drops them. */
export type Squad = { supervisor: string; members: SquadMemberFacts[] };

/** Every session that has subagents, as a squad: parent to children with their lifecycle facts. */
export function squadsOf(sessions: Sessions): Squad[] {
  return sessions
    .filter((s) => s.subagents.length > 0)
    .map((s) => ({
      supervisor: `${LOCAL_PREFIX}${s.key}`,
      members: s.subagents.map((c) => ({
        id: `${LOCAL_PREFIX}${s.key}${SUBAGENT_INFIX}${c.id}`,
        type: c.type,
        nickname: c.nickname,
        status: c.status,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        lastSeen: c.lastSeen,
        toolCount: c.tools?.count ?? 0,
        lastTool: c.tools?.last ?? null,
        tokensPerMinute: c.tokens?.perMinute ?? null,
        toolAt: c.tools?.lastAt ?? null,
        result: c.result ? { error: c.result.error } : null,
      })),
    }));
}

/** How many subagents each supervisor has working now, by its member id. */
const liveSquadsOf = (sessions: Sessions): Record<string, number> =>
  Object.fromEntries(
    squadsOf(sessions).map((s) => [
      s.supervisor,
      s.members.filter((m) => m.status !== 'finished').length,
    ]),
  );

/** Messages and subagent work, as the exchanges the camera can cut to and the scene can draw. */
function pulsesOf(data: Snapshot | undefined, sessions: Sessions, now: number): Pulse[] {
  const messages = (data?.messages ?? []).flatMap((m) =>
    m.deliveries.map((d) => ({
      id: `${m.id}:${d.recipientId}`,
      from: m.senderId,
      to: d.recipientId,
      kind: m.kind,
      at: m.createdAt,
    })),
  );
  const subagents = sessions.flatMap((s) =>
    s.subagents
      .filter((c) => isWorking(c) && now - c.lastSeen < SUBAGENT_LIVE_MS)
      .map((c) => ({
        id: `sub:${s.key}:${c.id}`,
        from: `${LOCAL_PREFIX}${s.key}`,
        to: `${LOCAL_PREFIX}${s.key}${SUBAGENT_INFIX}${c.id}`,
        kind: 'sub' as const,
        at: c.lastSeen,
      })),
  );
  return [...messages, ...subagents];
}

/** Each live subagent with its parent session's member: the office draws a faint tether between them. */
function tethersOf(sessions: Sessions): { parent: string; child: string }[] {
  return sessions.flatMap((s) =>
    s.subagents.filter(isWorking).map((c) => ({
      parent: `${LOCAL_PREFIX}${s.key}`,
      child: `${LOCAL_PREFIX}${s.key}${SUBAGENT_INFIX}${c.id}`,
    })),
  );
}

/** What each observed member is doing right now, in a word: the tool its last hook named, or the state it waits in. */
function doingOf(sessions: Sessions, locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sessions) {
    const id = `${LOCAL_PREFIX}${s.key}`;
    if (s.hook?.activity === 'waiting_permission')
      out[id] = translate(locale, 'waitingForApproval');
    else if (s.hook?.tool) out[id] = s.hook.tool;
    for (const c of s.subagents.filter(isWorking)) out[`${id}${SUBAGENT_INFIX}${c.id}`] = c.type;
  }
  return out;
}

/** Each session member's full title and technical id: the name tag's tooltip, where the short label is not enough. */
function namesOf(sessions: Sessions): Record<string, { title: string; tag: string; repo: string }> {
  return Object.fromEntries(
    sessions.map((s) => [
      `${LOCAL_PREFIX}${s.key}`,
      { title: s.title ?? s.repo, tag: tagOf(s), repo: s.repo },
    ]),
  );
}

/** What each observed member's screen shows: the session's own facts, nothing made up. */
export function screensOf(sessions: Sessions, now: number): Record<string, ScreenFacts> {
  const out: Record<string, ScreenFacts> = {};
  for (const s of sessions) {
    const activity = activityOf(s, now);
    const { contextPct, model } = s.usage;
    out[`${LOCAL_PREFIX}${s.key}`] = {
      provider: s.provider,
      // A desk screen has room for a short line: the title on a meaning boundary, not cut in the middle of a bracket.
      title: s.title && shortLabel(s.title, { maxWidth: SCREEN_TITLE_WIDTH, repo: s.repo }),
      repo: s.repo,
      branch: s.git?.branch ?? null,
      ahead: s.git?.ahead ?? 0,
      behind: s.git?.behind ?? 0,
      uncommitted: s.git?.uncommitted ?? 0,
      model,
      contextPercent: contextPct,
      state: ['working', 'idle', 'waiting_permission', 'offline'].includes(activity)
        ? (activity as ScreenFacts['state'])
        : 'unknown',
      tool: s.hook?.tool ?? null,
      // A tool is only running until the next event, so its clock starts at the hook's last event.
      toolSince: s.hook?.tool ? s.hook.at : null,
      recent: (s.hook?.recent ?? [])
        .filter((c) => !c.agentId) // the session's own calls; a helper's are shown with the helper
        .map(({ tool, target }) => ({ tool, target })),
      quietMinutes: s.liveness.quietMs === null ? null : Math.floor(s.liveness.quietMs / 60_000),
      ports: s.ports,
    };
  }
  return out;
}

/** What the compaction detector watches in each observed member: the context in use and the CLI's own marker. */
function contextsOf(sessions: Sessions): Record<string, ContextReading> {
  return Object.fromEntries(
    sessions.map((s) => [
      `${LOCAL_PREFIX}${s.key}`,
      {
        used: s.usage.contextTokens,
        window: s.usage.contextWindow,
        compactedAt: s.usage.compactedAt,
      },
    ]),
  );
}

/** How hard each observed member is working (see activity-rate.ts); subagents work at least at the base level. */
function intensitiesOf(
  sessions: Sessions,
  beats: ReadonlyMap<string, number>,
  now: number,
): Record<string, Intensity> {
  const out: Record<string, Intensity> = {};
  for (const s of sessions) {
    const level = intensityOf(s, activityOf(s, now) === 'working', beats.get(s.key) ?? 0, now);
    const id = `${LOCAL_PREFIX}${s.key}`;
    out[id] = level;
    for (const c of s.subagents)
      if (isWorking(c) && now - c.lastSeen < 20_000) out[`${id}${SUBAGENT_INFIX}${c.id}`] = 1;
  }
  return out;
}

/**
 * Everything the office draws about the machine's own sessions: the members they make, and how the scene dresses them
 * (floor, role, branch, sleeping rabbit, ghost, jiangshi) and who has been sent home. Recomputed on every render, because liveness depends on the clock.
 */
export function officeModel(
  data: Snapshot | undefined,
  sessions: Sessions | undefined,
  projectId: string | undefined,
  locale: 'zh-TW' | 'en',
  beats: ReadonlyMap<string, number> = new Map(),
  leaving: Readonly<Record<string, number>> = {},
) {
  const all = sessions ?? [];
  const observed: Agent[] =
    data && projectId && sessions
      ? sessionsToAgents(
          all.filter((s) => s.projectId === projectId),
          projectId,
          Date.now(),
          locale,
        )
      : [];
  return {
    observed,
    agents: data ? [...data.agents, ...observed] : [],
    apparitions: apparitionsOf(all),
    zombies: zombiesOf(all),
    leaving: stillGone(leaving, all),
    floorOf: floorResolver(all),
    roleOf: roleResolver(all),
    branchOf: branchResolver(all),
    pulses: pulsesOf(data, all, Date.now()),
    tethers: tethersOf(all),
    screens: screensOf(all, Date.now()),
    names: namesOf(all),
    contexts: contextsOf(all),
    intensity: intensitiesOf(all, beats, Date.now()),
    doing: doingOf(all, locale),
    attention: attentionOf(all, locale),
    liveSquads: liveSquadsOf(all),
    squads: squadsOf(all),
  };
}
export type OfficeModel = ReturnType<typeof officeModel>;
