import type { Agent, AttributedSession } from '@aether/contracts';
import { toPlainPreview } from '@aether/kernel';
import { LOCAL_PREFIX, activityOf, formatSpan, rowLabelOf } from '../localSessions.js';
import type { SquadView } from './feed-squads.js';
import { sessionWaiting } from './needs-you.js';

/**
 * Pure. The session feed: every observed session as one row, sorted into what a person should look at first: those
 * waiting on them, those working, those that just finished (with an unread marker) and the rest, idle.
 */
export type Utterance = { text: string; at: number | null };
export type Speech = { user: Utterance | null; assistant: Utterance | null };
export type FeedBucket = 'needs' | 'working' | 'finished' | 'idle';
const BUCKETS: readonly FeedBucket[] = ['needs', 'working', 'finished', 'idle'];

export type FeedItem = {
  key: string;
  agent: Agent;
  session: AttributedSession;
  bucket: FeedBucket;
  /** The session's own title, else its repository. */
  label: string;
  /** Repository and branch, when the label is not already the repository. */
  where: string;
  /** The newest thing the agent said, as plain text. */
  reply: string | null;
  /** The tool it is running (or last ran) with its target, while it works or waits. */
  tool: string | null;
  /** Why it waits: a permission prompt, or a notification that wants a person. */
  reason: 'permission' | 'attention' | null;
  /** Newest sign of life: the transcript, a hook event, the latest reply. */
  at: number;
  unread: boolean;
  stale: boolean;
  /** Its subagents, nested under it (attached by `groupFeed`); never a row of their own. */
  squad?: SquadView | null;
};
export type Feed = Record<FeedBucket, FeedItem[]>;

/** A session that finished this recently still counts as news; older ones are just idle. */
const FINISHED_MS = 30 * 60 * 1000;
/** Idle this long and a row fades. */
export const STALE_MS = 2 * 60 * 60 * 1000;
export const MAX_IDLE_ROWS = 30;
/** A reply is previewed in a line or two: this many characters is more than any row shows. */
const REPLY_CHARS = 200;

/** "3 分鐘前", "2 min ago", "剛剛": when something last happened. */
export function ago(ms: number, locale: 'zh-TW' | 'en'): string {
  if (ms < 60_000) return locale === 'zh-TW' ? '剛剛' : 'now';
  return locale === 'zh-TW' ? `${formatSpan(ms, locale)}前` : `${formatSpan(ms, locale)} ago`;
}

export function buildFeed({
  sessions,
  agents,
  speech,
  seen,
  now,
  asking = new Set<string>(),
}: {
  sessions: readonly AttributedSession[];
  agents: readonly Agent[];
  speech: Readonly<Record<string, Speech>>;
  /** When each session was last opened, by key. */
  seen: Readonly<Record<string, number>>;
  now: number;
  /** Sessions with a permission request waiting for an answer here: they need a person whatever their hooks last said. */
  asking?: ReadonlySet<string>;
}): Feed {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const feed: Feed = { needs: [], working: [], finished: [], idle: [] };
  for (const session of sessions) {
    const agent = byId.get(`${LOCAL_PREFIX}${session.key}`);
    const activity = activityOf(session, now);
    if (!agent || activity === 'offline') continue;
    const said = speech[session.key]?.assistant ?? null;
    const at = Math.max(session.mtime, session.hook?.at ?? 0, said?.at ?? 0);
    const requested = asking.has(session.key);
    const waiting = requested || sessionWaiting(session, now);
    const bucket: FeedBucket = waiting
      ? 'needs'
      : activity === 'working'
        ? 'working'
        : now - at < FINISHED_MS
          ? 'finished'
          : 'idle';
    const last = session.hook?.recent?.filter((r) => !r.agentId).at(-1);
    const tool =
      bucket === 'working' || bucket === 'needs'
        ? (session.hook?.tool ?? last?.tool ?? null)
        : null;
    const target = tool && last?.tool === tool ? last.target : null;
    const branch = session.git?.branch;
    feed[bucket].push({
      key: session.key,
      agent,
      session,
      bucket,
      label: rowLabelOf(session),
      where: [session.title ? session.repo : null, branch].filter(Boolean).join(' · '),
      reply: said ? toPlainPreview(said.text, { maxChars: REPLY_CHARS }) || null : null,
      tool: tool ? (target ? `${tool} ${target}` : tool) : null,
      reason: !waiting
        ? null
        : requested || session.hook?.lastEvent === 'PermissionRequest'
          ? 'permission'
          : 'attention',
      at,
      unread: (bucket === 'needs' || bucket === 'finished') && at > (seen[session.key] ?? 0),
      stale: bucket === 'idle' && now - at > STALE_MS,
    });
  }
  for (const bucket of BUCKETS) feed[bucket].sort((a, b) => b.at - a.at);
  feed.idle.length = Math.min(feed.idle.length, MAX_IDLE_ROWS);
  return feed;
}

export const feedItems = (feed: Feed): FeedItem[] => BUCKETS.flatMap((b) => feed[b]);
/** What the peek shows when nothing is chosen: the row that most wants a look. */
export const mostUrgent = (feed: Feed): FeedItem | null => feedItems(feed)[0] ?? null;
/** The sessions a badge counts: those waiting on a person and finished ones not yet opened. One answer for every badge. */
export const attentionKeys = (feed: Feed): ReadonlySet<string> =>
  new Set([...feed.needs, ...feed.finished.filter((i) => i.unread)].map((i) => i.key));
export const attentionCount = (feed: Feed): number => attentionKeys(feed).size;
