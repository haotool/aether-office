import type { Agent, LocalSessionsResponse, Snapshot } from '@aether/contracts';
import type { Pulse, ScreenFacts } from '@aether/office-scene/model';
import { intensityOf, type Intensity } from './activity-rate.js';
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
  zombiesOf,
} from '../localSessions.js';

type Sessions = LocalSessionsResponse['sessions'];

/** A subagent that has done something in the last half minute is still working for its parent. */
const SUBAGENT_LIVE_MS = 20_000;

/** Messages and subagent work, as the exchanges the camera can cut to and the scene can draw. */
export function pulsesOf(data: Snapshot | undefined, sessions: Sessions, now: number): Pulse[] {
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
      .filter((c) => now - c.lastSeen < SUBAGENT_LIVE_MS)
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

/** What each observed member is doing right now, in a word: the tool its last hook named, or the state it waits in. */
export function doingOf(sessions: Sessions, zh: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sessions) {
    const id = `${LOCAL_PREFIX}${s.key}`;
    if (s.hook?.activity === 'waiting_permission')
      out[id] = zh ? '等待授權' : 'waiting for approval';
    else if (s.hook?.tool) out[id] = s.hook.tool;
    for (const c of s.subagents) out[`${id}${SUBAGENT_INFIX}${c.id}`] = c.type;
  }
  return out;
}

/** What each observed member's screen shows: the session's own facts, nothing made up. */
export function screensOf(sessions: Sessions, now: number): Record<string, ScreenFacts> {
  const out: Record<string, ScreenFacts> = {};
  for (const s of sessions) {
    const activity = activityOf(s, now);
    const { contextTokens, contextWindow, model } = s.usage;
    out[`${LOCAL_PREFIX}${s.key}`] = {
      provider: s.provider,
      title: s.title,
      repo: s.repo,
      branch: s.git?.branch ?? null,
      ahead: s.git?.ahead ?? 0,
      behind: s.git?.behind ?? 0,
      uncommitted: s.git?.uncommitted ?? 0,
      model,
      contextPercent:
        contextTokens !== null && contextWindow ? (contextTokens / contextWindow) * 100 : null,
      state: ['working', 'idle', 'waiting_permission', 'offline'].includes(activity)
        ? (activity as ScreenFacts['state'])
        : 'unknown',
      tool: s.hook?.tool ?? null,
      // A tool is only running until the next event, so its clock starts at the hook's last event.
      toolSince: s.hook?.tool ? s.hook.at : null,
      recent: (s.hook?.recent ?? []).map(({ tool, target }) => ({ tool, target })),
      quietMinutes: s.liveness.quietMs === null ? null : Math.floor(s.liveness.quietMs / 60_000),
      ports: s.ports,
    };
  }
  return out;
}

/** How hard each observed member is working (see activity-rate.ts); subagents work at least at the base level. */
export function intensitiesOf(
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
      if (now - c.lastSeen < 20_000) out[`${id}${SUBAGENT_INFIX}${c.id}`] = 1;
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
    screens: screensOf(all, Date.now()),
    intensity: intensitiesOf(all, beats, Date.now()),
    doing: doingOf(all, locale === 'zh-TW'),
    attention: attentionOf(all, locale),
  };
}
export type OfficeModel = ReturnType<typeof officeModel>;
