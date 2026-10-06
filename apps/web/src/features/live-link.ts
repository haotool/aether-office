import type { QueryKey } from '@tanstack/react-query';

/**
 * The live link to the control plane, as pure functions: what a change event refreshes, how long to wait before
 * reconnecting, and what the connection indicator says. The EventSource itself lives in use-session-stream.ts.
 */
export type ChangeKind = 'state' | 'tool' | 'speech' | 'transcript';
export type SessionChange = { seq: number; key: string; kinds: ChangeKind[] };

/** Parses an event's data; anything that is not a change is ignored rather than trusted. */
export function parseChange(data: string): SessionChange | null {
  try {
    const v = JSON.parse(data) as Partial<SessionChange>;
    if (typeof v.seq !== 'number' || typeof v.key !== 'string' || !Array.isArray(v.kinds))
      return null;
    return { seq: v.seq, key: v.key, kinds: v.kinds };
  } catch {
    return null;
  }
}

export const LOCAL_SESSIONS_KEY: QueryKey = ['local-sessions'];
export const SPEECH_KEY: QueryKey = ['speech'];
export const transcriptKey = (key: string): QueryKey => ['transcript', key];

/** Every query a set of changes makes stale (deduplicated; a query nobody is looking at is only marked, not fetched). */
export function queriesFor(changes: readonly SessionChange[]): QueryKey[] {
  const out = new Map<string, QueryKey>();
  const add = (key: QueryKey) => out.set(JSON.stringify(key), key);
  for (const { key, kinds } of changes) {
    if (kinds.some((k) => k !== 'speech')) add(LOCAL_SESSIONS_KEY);
    if (kinds.includes('speech')) add(SPEECH_KEY);
    if (kinds.includes('speech') || kinds.includes('transcript')) add(transcriptKey(key));
  }
  return [...out.values()];
}

/** Everything the link feeds, for when changes may have been missed (reconnect after a gap, waking, back online). */
export const allQueries = (): QueryKey[] => [LOCAL_SESSIONS_KEY, SPEECH_KEY, ['transcript']];

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
/** Exponential backoff with full jitter: `random` in [0, 1) picks a point in the window. At least 250 ms. */
export function backoffMs(attempt: number, random: number): number {
  const window = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.max(250, Math.round(window * random));
}

/** After this many failed attempts in a row the indicator says offline rather than reconnecting. */
export const OFFLINE_AFTER_FAILURES = 3;

export type LinkStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';
export type LinkState = {
  status: LinkStatus;
  failures: number;
  /** When the stream last said anything (ms epoch), or null before the first word. */
  lastAt: number | null;
};
export type LinkAction =
  | { type: 'open'; at: number }
  | { type: 'message'; at: number }
  | { type: 'lost'; online: boolean }
  | { type: 'reset' };

export const initialLink: LinkState = { status: 'connecting', failures: 0, lastAt: null };

export function linkReducer(state: LinkState, action: LinkAction): LinkState {
  switch (action.type) {
    case 'open':
      return { status: 'live', failures: 0, lastAt: action.at };
    case 'message':
      return state.status === 'live' ? { ...state, lastAt: action.at } : state;
    case 'lost': {
      const failures = state.failures + 1;
      return {
        ...state,
        failures,
        status: !action.online || failures >= OFFLINE_AFTER_FAILURES ? 'offline' : 'reconnecting',
      };
    }
    case 'reset':
      return { ...initialLink, lastAt: state.lastAt };
  }
}

/** While the stream is live the polling is only a slow safety net (CPU and memory are not events). */
export const SAFETY_NET_MS = 30_000;
/** The polling interval to use: the stream's safety net while it is live, otherwise the caller's own. */
export function pollMs<T>(live: boolean, fallback: T): T | number {
  return live ? SAFETY_NET_MS : fallback;
}

/** "4s", "3 min": how long ago, for the connection indicator. */
export function ageText(ms: number, locale: 'zh-TW' | 'en'): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return locale === 'zh-TW' ? `${s} 秒` : `${s}s`;
  const m = Math.floor(s / 60);
  return locale === 'zh-TW' ? `${m} 分` : `${m} min`;
}
