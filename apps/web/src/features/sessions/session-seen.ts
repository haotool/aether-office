import { useCallback, useState } from 'react';

/** Kept in this browser only and never sent anywhere; a browser that refuses storage starts with everything unread. */
type Seen = Readonly<Record<string, number>>;
const STORAGE_KEY = 'aether.sessionSeen';
const MAX_KEPT = 200;

export function withSeen(seen: Seen, key: string, at: number): Seen {
  if ((seen[key] ?? 0) >= at) return seen;
  const next = { ...seen, [key]: at };
  const keys = Object.keys(next);
  if (keys.length <= MAX_KEPT) return next;
  const oldest = keys
    .sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0))
    .slice(0, keys.length - MAX_KEPT);
  return Object.fromEntries(Object.entries(next).filter(([k]) => !oldest.includes(k)));
}

export function parseSeen(raw: string | null): Seen {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)),
    ) as Seen;
  } catch {
    return {};
  }
}

const load = (): Seen => {
  try {
    return parseSeen(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
};

export function useSeen() {
  const [seen, setSeen] = useState<Seen>(load);
  const markSeen = useCallback((key: string, at: number) => {
    setSeen((was) => {
      const next = withSeen(was, key, at);
      if (next !== was)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* storage refused: unread only lasts for this page */
        }
      return next;
    });
  }, []);
  return { seen, markSeen };
}

function readSeen(key: string): number {
  return load()[key] ?? 0;
}

// Opening a session marks it seen right away, so the conversation needs the earlier value to show "new since you
// looked".
const baselines = new Map<string, number>();
export const holdBaseline = (key: string, at: number) => baselines.set(key, at);
export const releaseBaseline = (key: string) => baselines.delete(key);
export const seenBaseline = (key: string): number => baselines.get(key) ?? readSeen(key);
