import type { Agent, AttributedSession } from '@aether/contracts';
import { toPlainPreview } from '@aether/kernel';
import { LOCAL_PREFIX, rowLabelOf } from '../../lib/sessions/session-names.js';
import { activityOf } from '../../lib/sessions/session-attention.js';
import type { SquadView } from './feed-squads.js';
import { sessionWaiting } from '../sessions/needs-you.js';

/**
 * Pure. The session feed: every observed session as one row, sorted into what a person should look at first: those
 * waiting on them, those working, those that just finished (with an unread marker) and the rest, idle.
 */
type Utterance = { text: string; at: number | null };
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
  /** Whether the replies have been fetched at all: until then an empty `reply` means "not known yet", not "no reply". */
  replyLoaded: boolean;
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
const STALE_MS = 2 * 60 * 60 * 1000;
const MAX_IDLE_ROWS = 30;
/** A reply is previewed in a line or two: this many characters is more than any row shows. */
const REPLY_CHARS = 200;

type RowInput = {
  session: AttributedSession;
  agent: Agent;
  activity: ReturnType<typeof activityOf>;
  speech: Readonly<Record<string, Speech>> | undefined;
  seen: Readonly<Record<string, number>>;
  now: number;
  /** A permission request of this session waits for an answer here. */
  requested: boolean;
};

const feedBucket = (
  waiting: boolean,
  activity: RowInput['activity'],
  at: number,
  now: number,
): FeedBucket => {
  if (waiting) return 'needs';
  if (activity === 'working') return 'working';
  return now - at < FINISHED_MS ? 'finished' : 'idle';
};

const feedToolLine = (session: AttributedSession, bucket: FeedBucket): string | null => {
  if (bucket !== 'working' && bucket !== 'needs') return null;
  const last = session.hook?.recent?.filter((r) => !r.agentId).at(-1);
  const tool = session.hook?.tool ?? last?.tool ?? null;
  if (!tool) return null;
  const target = last?.tool === tool ? last.target : null;
  return target ? `${tool} ${target}` : tool;
};

const feedWaitReason = (
  waiting: boolean,
  requested: boolean,
  session: AttributedSession,
): FeedItem['reason'] => {
  if (!waiting) return null;
  return requested || session.hook?.lastEvent === 'PermissionRequest' ? 'permission' : 'attention';
};

/** The row of one session: which bucket it belongs to, what it said last, what it is doing and whether it is news. */
function feedRow({ session, agent, activity, speech, seen, now, requested }: RowInput): FeedItem {
  const said = speech?.[session.key]?.assistant ?? null;
  const at = Math.max(session.mtime, session.hook?.at ?? 0, said?.at ?? 0);
  const waiting = requested || sessionWaiting(session, now);
  const bucket = feedBucket(waiting, activity, at, now);
  const branch = session.git?.branch;
  return {
    key: session.key,
    agent,
    session,
    bucket,
    label: rowLabelOf(session),
    where: [session.title ? session.repo : null, branch].filter(Boolean).join(' · '),
    reply: said ? toPlainPreview(said.text, { maxChars: REPLY_CHARS }) || null : null,
    replyLoaded: speech !== undefined,
    tool: feedToolLine(session, bucket),
    reason: feedWaitReason(waiting, requested, session),
    at,
    unread: (bucket === 'needs' || bucket === 'finished') && at > (seen[session.key] ?? 0),
    stale: bucket === 'idle' && now - at > STALE_MS,
  };
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
  /** By session key; undefined while the first answer is still on its way. */
  speech: Readonly<Record<string, Speech>> | undefined;
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
    const row = feedRow({
      session,
      agent,
      activity,
      speech,
      seen,
      now,
      requested: asking.has(session.key),
    });
    feed[row.bucket].push(row);
  }
  for (const bucket of BUCKETS) feed[bucket].sort((a, b) => b.at - a.at);
  feed.idle.length = Math.min(feed.idle.length, MAX_IDLE_ROWS);
  return feed;
}

/** The locale key for a row with no reply to show: "No reply yet" is only said once the replies are known. */
export const noReplyKey = (item: Pick<FeedItem, 'session' | 'replyLoaded'>) =>
  item.replyLoaded && item.session.process === 'running' ? 'feedNoReply' : 'feedReplyNotLoaded';

export const feedItems = (feed: Feed): FeedItem[] => BUCKETS.flatMap((b) => feed[b]);
/** What the peek shows when nothing is chosen: the row that most wants a look. */
export const mostUrgent = (feed: Feed): FeedItem | null => feedItems(feed)[0] ?? null;
/** The sessions a badge counts: those waiting on a person and finished ones not yet opened. One answer for every badge. */
export const attentionKeys = (feed: Feed): ReadonlySet<string> =>
  new Set([...feed.needs, ...feed.finished.filter((i) => i.unread)].map((i) => i.key));
export const attentionCount = (feed: Feed): number => attentionKeys(feed).size;
