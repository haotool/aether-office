import type { Agent, AttributedSession } from '@aether/contracts';
import { toPlainPreview } from '@aether/kernel';
import { LOCAL_PREFIX, rowLabelOf } from '../../lib/sessions/session-names.js';
import { activityOf } from '../../lib/sessions/session-attention.js';
import type { SquadView } from './feed-squads.js';
import { sessionWaiting } from '../sessions/needs-you.js';

type Utterance = { text: string; at: number | null };
export type Speech = { user: Utterance | null; assistant: Utterance | null };
export type FeedBucket = 'needs' | 'working' | 'finished' | 'idle';
const BUCKETS: readonly FeedBucket[] = ['needs', 'working', 'finished', 'idle'];

export type FeedItem = {
  key: string;
  agent: Agent;
  session: AttributedSession;
  bucket: FeedBucket;
  label: string;
  where: string;
  reply: string | null;
  replyLoaded: boolean;
  tool: string | null;
  reason: 'permission' | 'attention' | null;
  at: number;
  unread: boolean;
  stale: boolean;
  squad?: SquadView | null;
};
export type Feed = Record<FeedBucket, FeedItem[]>;

const FINISHED_MS = 30 * 60 * 1000;
const STALE_MS = 2 * 60 * 60 * 1000;
const MAX_IDLE_ROWS = 30;
const REPLY_CHARS = 200;

type RowInput = {
  session: AttributedSession;
  agent: Agent;
  activity: ReturnType<typeof activityOf>;
  speech: Readonly<Record<string, Speech>> | undefined;
  seen: Readonly<Record<string, number>>;
  now: number;
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
  speech: Readonly<Record<string, Speech>> | undefined;
  seen: Readonly<Record<string, number>>;
  now: number;
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

export const noReplyKey = (item: Pick<FeedItem, 'session' | 'replyLoaded'>) =>
  item.replyLoaded && item.session.process === 'running' ? 'feedNoReply' : 'feedReplyNotLoaded';

export const feedItems = (feed: Feed): FeedItem[] => BUCKETS.flatMap((b) => feed[b]);
export const mostUrgent = (feed: Feed): FeedItem | null => feedItems(feed)[0] ?? null;
export const attentionKeys = (feed: Feed): ReadonlySet<string> =>
  new Set([...feed.needs, ...feed.finished.filter((i) => i.unread)].map((i) => i.key));
export const attentionCount = (feed: Feed): number => attentionKeys(feed).size;
