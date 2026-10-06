/**
 * Has a session just been compacted? Two kinds of evidence, both from observations of the session over time:
 * the CLI's own marker (the server reports when the transcript last held one) and a large fall in the context in use.
 * Pure: the caller keeps one tracker per session and feeds it every observation.
 */
export type Observation = {
  /** When this was observed (epoch ms). */
  at: number;
  used: number | null;
  window: number | null;
  /** When the CLI last wrote a compaction marker, from the server. */
  compactedAt: number | null;
};
/** What the server reports about a session's context: the observation without its time. */
export type ContextReading = Omit<Observation, 'at'>;
export type Compaction = {
  /** Identifies the detection, so an effect plays once for it. */
  key: number;
  kind: 'marker' | 'drop';
  /** Share of the window in use before and after, 0 to 100; null when not known. */
  fromPct: number | null;
  toPct: number | null;
};
export type Tracker = { last: Observation | null; firedAt: number | null };
export const NEW_TRACKER: Tracker = { last: null, firedAt: null };

/** A fall counts only when the context lost more than half of what it held and at least this many tokens. */
const DROP_RATIO = 0.5;
const DROP_MIN_TOKENS = 20_000;
/** A marker already in the transcript when the session first appears counts only if it is this fresh. */
const FRESH_MARKER_MS = 30_000;
/** After a detection, a fall belonging to the same compaction (usage lags the marker) is not a second one. */
export const SETTLE_MS = 90_000;

const pct = (o: Observation) =>
  o.used !== null && o.window ? Math.min(100, (o.used / o.window) * 100) : null;

/** One step: the new tracker, and the compaction this observation reveals, if any. */
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
    last.window === next.window && // a model switch changes the window: its numbers are not comparable
    next.used < last.used * DROP_RATIO &&
    last.used - next.used > DROP_MIN_TOKENS
  )
    event = fire('drop', next.at);
  return {
    tracker: { last: next, firedAt: event ? next.at : firedAt },
    event,
  };
}
