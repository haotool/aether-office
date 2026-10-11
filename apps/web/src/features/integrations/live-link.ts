import type { QueryKey } from '@tanstack/react-query';
import { fill, translate } from '../../lib/i18n/i18n.js';

type ChangeKind = 'state' | 'tool' | 'speech' | 'transcript' | 'squad' | 'outcome';
export type SessionChange = { seq: number; key: string; kinds: ChangeKind[] };

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

const LOCAL_SESSIONS_KEY: QueryKey = ['local-sessions'];
const SPEECH_KEY: QueryKey = ['speech'];
export const USAGE_KEY: QueryKey = ['usage'];
const transcriptKey = (key: string): QueryKey => ['transcript', key];

export function queriesFor(changes: readonly SessionChange[]): QueryKey[] {
  const out = new Map<string, QueryKey>();
  const add = (key: QueryKey) => out.set(JSON.stringify(key), key);
  for (const { key, kinds } of changes) {
    if (kinds.some((k) => k !== 'speech')) add(LOCAL_SESSIONS_KEY);
    if (kinds.includes('speech')) add(SPEECH_KEY);
    if (kinds.includes('speech') || kinds.includes('transcript')) add(transcriptKey(key));
    if (kinds.includes('transcript')) add(USAGE_KEY);
  }
  return [...out.values()];
}

export const allQueries = (): QueryKey[] => [
  LOCAL_SESSIONS_KEY,
  SPEECH_KEY,
  ['transcript'],
  USAGE_KEY,
];

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
export function backoffMs(attempt: number, random: number): number {
  const window = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.max(250, Math.round(window * random));
}

export const OFFLINE_AFTER_FAILURES = 3;

export type LinkStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';
export type LinkState = {
  status: LinkStatus;
  failures: number;
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

export function ageText(ms: number, locale: 'zh-TW' | 'en'): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return fill(translate(locale, 'ageSeconds'), s);
  return fill(translate(locale, 'ageMinutes'), Math.floor(s / 60));
}
