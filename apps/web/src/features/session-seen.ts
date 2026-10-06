import { useCallback, useState } from 'react';

/**
 * When each session was last opened, by key, kept in this browser only: "unread" is whatever happened after that. Never
 * sent anywhere, and a browser that refuses storage just starts with everything unread.
 */
export type Seen = Readonly<Record<string, number>>;
const STORAGE_KEY = 'aether.sessionSeen';
const MAX_KEPT = 200;

/** Pure. A new map with the session opened at `at` (never moving backwards), the oldest dropped past a bound. */
export function withSeen(seen: Seen, key: string, at: number): Seen {
  if ((seen[key] ?? 0) >= at) return seen;
  const next = { ...seen, [key]: at };
  const keys = Object.keys(next);
  if (keys.length <= MAX_KEPT) return next;
  const oldest = keys.sort((a, b) => next[a]! - next[b]!).slice(0, keys.length - MAX_KEPT);
  return Object.fromEntries(Object.entries(next).filter(([k]) => !oldest.includes(k)));
}

/** Pure. Anything stored that is not a map of numbers is ignored. */
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
