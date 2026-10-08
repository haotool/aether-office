// The per-file usage state shared by the Claude and Codex readers: one bucket per local calendar day, the counters in
// it, and the few byte-level helpers both need. Only counters, the model name and timestamps are ever read.

export type Counters = {
  /** New input, without what the cache served. */
  i: number;
  /** Output, without reasoning. */
  o: number;
  /** Input served from the cache. */
  cr: number;
  /** Input written to the cache. */
  cw: number;
  /** Reasoning output (Codex; Claude folds thinking into output). */
  r: number;
};
export type Bucket = Counters & {
  /** Model requests. */
  req: number;
  tools: number;
  /** Active milliseconds: gaps of at most ACTIVE_GAP_MS between events. */
  ms: number;
  /** Tokens without cache reads, per model. */
  m: Record<string, number>;
};
export type ParseState = {
  provider: 'claude' | 'codex';
  days: Record<string, Bucket>;
  /** Claude: the message being written (one message is several lines repeating its usage) and what was counted of it. */
  lastId: string | null;
  lastUsage: Counters | null;
  /** Codex: the running total of the session, to turn it into deltas. */
  total: Counters | null;
  model: string | null;
  lastAt: number | null;
  /** Lines that held usage the parser could not place (no usable timestamp, a cut counter line): counted, never silent. */
  skipped: number;
  /** Claude lines the byte fast path missed that a bounded JSON.parse read instead (work counter, for tests). */
  fallbacks: number;
};
export type DayOf = (ms: number) => string;

const ACTIVE_GAP_MS = 5 * 60 * 1000;
const MAX_MODELS_PER_DAY = 8;
export const ZERO: Counters = { i: 0, o: 0, cr: 0, cw: 0, r: 0 };

export const newState = (provider: ParseState['provider']): ParseState => ({
  provider,
  days: {},
  lastId: null,
  lastUsage: null,
  total: null,
  model: null,
  lastAt: null,
  skipped: 0,
  fallbacks: 0,
});

/** Tokens a bucket or delta counts as spent: everything but cache reads. */
export const fresh = (c: Counters) => c.i + c.o + c.cw + c.r;

export function bucketOf(state: ParseState, day: string): Bucket {
  return (state.days[day] ??= { ...ZERO, req: 0, tools: 0, ms: 0, m: {} });
}

export function addTokens(state: ParseState, day: string, delta: Counters, model: string | null) {
  const b = bucketOf(state, day);
  b.i += delta.i;
  b.o += delta.o;
  b.cr += delta.cr;
  b.cw += delta.cw;
  b.r += delta.r;
  const tokens = fresh(delta);
  if (tokens === 0) return;
  const name = model ?? 'unknown';
  const key = name in b.m || Object.keys(b.m).length < MAX_MODELS_PER_DAY ? name : 'other';
  b.m[key] = (b.m[key] ?? 0) + tokens;
}

/** An event at `at` extends the active time by the gap since the previous one, when that gap is short. */
export function touch(state: ParseState, at: number, day: string) {
  if (state.lastAt !== null && at > state.lastAt) {
    if (at - state.lastAt <= ACTIVE_GAP_MS) bucketOf(state, day).ms += at - state.lastAt;
    state.lastAt = at;
  } else state.lastAt ??= at;
}

const TS = Buffer.from('"timestamp":"');
/** The line's timestamp (epoch ms), searched from `near` first because Claude writes it after the usage. */
export function timestampOf(data: Buffer, near: number, start: number, end: number): number | null {
  let at = data.indexOf(TS, near);
  if (at < 0 || at >= end) at = data.indexOf(TS, start);
  if (at < 0 || at >= end) return null;
  const t = Date.parse(data.toString('utf8', at + TS.length, at + TS.length + 24));
  return Number.isFinite(t) ? t : null;
}

export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
export const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
