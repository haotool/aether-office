import type { Agent, LocalSessionsResponse, Snapshot, Subagent } from '@aether/contracts';
import { shortLabel } from '@aether/kernel';
import { translate, type Locale } from '../../lib/i18n/i18n.js';
import type { Pulse, ScreenFacts } from '@aether/office-scene/model';
import { intensityOf, type Intensity } from '../sessions/activity-rate.js';
import type { ContextReading } from '../conversation/compaction.js';
import { stillGone } from '../operations/clock-out.js';
import { LOCAL_PREFIX, tagOf } from '../../lib/sessions/session-names.js';
import { SUBAGENT_INFIX } from '../../lib/sessions/subagent-id.js';
import {
  activityOf,
  apparitionsOf,
  attentionOf,
  zombiesOf,
} from '../../lib/sessions/session-attention.js';
import {
  branchResolver,
  floorResolver,
  roleResolver,
  sessionsToAgents,
} from '../../lib/sessions/localSessions.js';

type Sessions = LocalSessionsResponse['sessions'];

const SCREEN_TITLE_WIDTH = 40;

const SUBAGENT_LIVE_MS = 20_000;

const isWorking = (c: Subagent) => c.status !== 'finished';

export type SquadMemberFacts = {
  id: string;
  type: string;
  nickname: string | null;
  status: Subagent['status'];
  startedAt: number | null;
  endedAt: number | null;
  lastSeen: number;
  toolCount: number;
  lastTool: string | null;
  tokensPerMinute: number | null;
  toolAt: number | null;
  result: { error: boolean | null } | null;
};
export type Squad = { supervisor: string; members: SquadMemberFacts[] };

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

const liveSquadsOf = (sessions: Sessions): Record<string, number> =>
  Object.fromEntries(
    squadsOf(sessions).map((s) => [
      s.supervisor,
      s.members.filter((m) => m.status !== 'finished').length,
    ]),
  );

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

function tethersOf(sessions: Sessions): { parent: string; child: string }[] {
  return sessions.flatMap((s) =>
    s.subagents.filter(isWorking).map((c) => ({
      parent: `${LOCAL_PREFIX}${s.key}`,
      child: `${LOCAL_PREFIX}${s.key}${SUBAGENT_INFIX}${c.id}`,
    })),
  );
}

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
      toolSince: s.hook?.tool ? s.hook.at : null,
      recent: (s.hook?.recent ?? [])
        .filter((c) => !c.agentId)
        .map(({ tool, target }) => ({ tool, target })),
      quietMinutes: s.liveness.quietMs === null ? null : Math.floor(s.liveness.quietMs / 60_000),
      ports: s.ports,
    };
  }
  return out;
}

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
