import type { Agent, LocalSessionsResponse, Snapshot } from '@aether/contracts';
import type { Pulse } from '@aether/office-scene/model';
import {
  LOCAL_PREFIX,
  SUBAGENT_INFIX,
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

/**
 * Everything the office draws about the machine's own sessions: the members they make, and how the scene dresses them
 * (floor, role, branch, sleeping rabbit, ghost, jiangshi). Recomputed on every render, because liveness depends on the clock.
 */
export function officeModel(
  data: Snapshot | undefined,
  sessions: Sessions | undefined,
  projectId: string | undefined,
  locale: 'zh-TW' | 'en',
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
    floorOf: floorResolver(all),
    roleOf: roleResolver(all),
    branchOf: branchResolver(all),
    pulses: pulsesOf(data, all, Date.now()),
    doing: doingOf(all, locale === 'zh-TW'),
    attention: attentionOf(all, locale),
  };
}
export type OfficeModel = ReturnType<typeof officeModel>;
