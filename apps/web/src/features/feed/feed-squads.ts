import type { AttributedSession, Subagent } from '@aether/contracts';
import { toPlainPreview } from '@aether/kernel';
import { SUBAGENT_INFIX, parentOf } from '../../lib/sessions/subagent-id.js';
import type { Feed, FeedBucket, FeedItem } from './feed-model.js';
import { squadsOf, type SquadMemberFacts } from '../office/office-model.js';

/**
 * Built on `squadsOf` (the same facts the scene draws), so the panel and the office can never disagree about who is in
 * a squad.
 */

export const SQUAD_GRACE_MS = 90_000;
export const SQUAD_FADE_AFTER_MS = 60_000;
export const SQUAD_FOLD_ABOVE = 3;
export const SQUAD_HUES = 6;
const TEXT_CHARS = 160;

export type SquadRow = {
  id: string;
  supervisor: string;
  type: string;
  nickname: string | null;
  status: Subagent['status'];
  startedAt: number | null;
  endedAt: number | null;
  toolCount: number | null;
  lastTool: string | null;
  task: string | null;
  result: string | null;
  fading: boolean;
};

export type SquadView = {
  hue: number;
  rows: SquadRow[];
  live: number;
  waiting: number;
  defaultOpen: boolean;
};

const rank = (status: Subagent['status']) =>
  status === 'waiting_permission' ? 0 : status === 'finished' ? 2 : 1;

const byId = (a: SquadRow, b: SquadRow) => a.id.localeCompare(b.id, 'en', { numeric: true });

function compareRows(a: SquadRow, b: SquadRow): number {
  const byRank = rank(a.status) - rank(b.status);
  if (byRank) return byRank;
  if (a.status === 'finished') return (b.endedAt ?? 0) - (a.endedAt ?? 0) || byId(a, b);
  return (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity) || byId(a, b);
}

export function squadHue(supervisor: string): number {
  let h = 7;
  for (const c of supervisor) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % SQUAD_HUES;
}

function textOf(sub: Subagent | undefined, field: 'label' | 'result'): string | null {
  const raw = field === 'label' ? sub?.label : sub?.result?.summary;
  if (typeof raw !== 'string') return null;
  return toPlainPreview(raw, { maxChars: TEXT_CHARS }) || null;
}

function rowOf(
  m: SquadMemberFacts,
  supervisor: string,
  sub: Subagent | undefined,
  now: number,
): SquadRow {
  const ended = m.status === 'finished' ? (m.endedAt ?? m.lastSeen) : null;
  return {
    id: m.id,
    supervisor,
    type: m.type,
    nickname: m.nickname,
    status: m.status,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    toolCount: sub?.tools ? m.toolCount : null,
    lastTool: m.lastTool,
    task: textOf(sub, 'label'),
    result: textOf(sub, 'result'),
    fading: ended !== null && now - ended >= SQUAD_FADE_AFTER_MS,
  };
}

export function squadViewOf(session: AttributedSession, now: number): SquadView | null {
  const squad = squadsOf([session])[0];
  if (!squad) return null;
  const byId = new Map(session.subagents.map((c) => [`${squad.supervisor}:sub:${c.id}`, c]));
  const rows = squad.members
    .filter((m) => m.status !== 'finished' || now - (m.endedAt ?? m.lastSeen) < SQUAD_GRACE_MS)
    .map((m) => rowOf(m, squad.supervisor, byId.get(m.id), now))
    .sort(compareRows);
  if (!rows.length) return null;
  const waiting = rows.filter((r) => r.status === 'waiting_permission').length;
  return {
    hue: squadHue(squad.supervisor),
    rows,
    live: rows.filter((r) => r.status !== 'finished').length,
    waiting,
    defaultOpen: rows.length <= SQUAD_FOLD_ABOVE || waiting > 0,
  };
}

export const squadAccentOf = (
  memberId: string,
  live: Readonly<Record<string, number>>,
): { squadHue?: number; tether: boolean } =>
  memberId.includes(SUBAGENT_INFIX)
    ? { squadHue: squadHue(parentOf(memberId)), tether: true }
    : (live[memberId] ?? 0) > 0
      ? { squadHue: squadHue(memberId), tether: false }
      : { tether: false };

/** The subagent's own id (what its hook records call `agentId`), from its member id. */
const subIdOf = (memberId: string) => memberId.split(SUBAGENT_INFIX)[1] ?? '';

export const callsOf = (session: AttributedSession, memberId: string) =>
  (session.hook?.recent ?? []).filter((r) => r.agentId === subIdOf(memberId));

const BUCKETS: readonly FeedBucket[] = ['needs', 'working', 'finished', 'idle'];

const compareItems = (a: FeedItem, b: FeedItem): number =>
  (b.squad?.waiting ? 1 : 0) - (a.squad?.waiting ? 1 : 0) || b.at - a.at;

export function groupFeed(feed: Feed, now: number): Feed {
  const out = {} as Feed;
  for (const bucket of BUCKETS)
    out[bucket] = feed[bucket]
      .map((item) => ({ ...item, squad: squadViewOf(item.session, now) }))
      .sort(compareItems);
  return out;
}

const SECOND = 1000;
export function elapsedLabel(
  row: Pick<SquadRow, 'startedAt' | 'endedAt'>,
  now: number,
): string | null {
  if (row.startedAt === null) return null;
  const s = Math.max(0, Math.floor(((row.endedAt ?? now) - row.startedAt) / SECOND));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

export type SquadChange = { started: number; finished: number };
export type SquadSnapshot = ReadonlyMap<string, boolean>;

export const snapshotOf = (feed: Feed): SquadSnapshot =>
  new Map(
    BUCKETS.flatMap((b) => feed[b]).flatMap((i) =>
      (i.squad?.rows ?? []).map((r) => [r.id, r.status === 'finished'] as const),
    ),
  );

export function squadChange(before: SquadSnapshot, after: SquadSnapshot): SquadChange {
  let started = 0;
  let finished = 0;
  for (const [id, done] of after) {
    const was = before.get(id);
    if (was === undefined && !done) started++;
    else if (was === false && done) finished++;
  }
  return { started, finished };
}
