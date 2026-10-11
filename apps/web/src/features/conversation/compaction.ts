/**
 * Has a session just been compacted? Two kinds of evidence: the CLI's own marker (the server reports when the
 * transcript last held one) and a large fall in the context in use. Pure: the caller keeps one tracker per session.
 */
type Observation = {
  at: number;
  used: number | null;
  window: number | null;
  compactedAt: number | null;
};
export type ContextReading = Omit<Observation, 'at'>;
export type Compaction = {
  key: number;
  kind: 'marker' | 'drop';
  fromPct: number | null;
  toPct: number | null;
};
export type Tracker = { last: Observation | null; firedAt: number | null };
export const NEW_TRACKER: Tracker = { last: null, firedAt: null };

const DROP_RATIO = 0.5;
const DROP_MIN_TOKENS = 20_000;
const FRESH_MARKER_MS = 30_000;
const SETTLE_MS = 90_000;

const pct = (o: Observation) =>
  o.used !== null && o.window ? Math.min(100, (o.used / o.window) * 100) : null;

export function observe(
  tracker: Tracker,
  next: Observation,
): { tracker: Tracker; event: Compaction | null } {
  const { last, firedAt } = tracker;
  const settled = firedAt !== null && next.at - firedAt < SETTLE_MS;
  const fire = (kind: Compaction['kind'], key: number): Compaction => ({
    key,
    kind,
    fromPct: last ? pct(last) : null,
    toPct: pct(next),
  });
  let event: Compaction | null = null;
  if (next.compactedAt !== null) {
    const isNew =
      last === null
        ? next.at - next.compactedAt < FRESH_MARKER_MS
        : next.compactedAt > (last.compactedAt ?? 0);
    if (isNew) event = fire('marker', next.compactedAt);
  }
  if (
    !event &&
    !settled &&
    last &&
    last.used !== null &&
    next.used !== null &&
    last.window !== null &&
    last.window === next.window &&
    next.used < last.used * DROP_RATIO &&
    last.used - next.used > DROP_MIN_TOKENS
  )
    event = fire('drop', next.at);
  return {
    tracker: { last: next, firedAt: event ? next.at : firedAt },
    event,
  };
}
