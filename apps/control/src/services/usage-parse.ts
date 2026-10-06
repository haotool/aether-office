// Token counters out of provider transcripts, incrementally: `parseChunk` takes whole lines appended since the last call
// and adds them to a per-file state holding one bucket per local calendar day. Only counters, the model name and
// timestamps are read; no message text is decoded, kept or returned. Nothing is decoded but the few hundred bytes around
// a record's counters (most of a transcript is tool output).

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
};
export type DayOf = (ms: number) => string;

export const ACTIVE_GAP_MS = 5 * 60 * 1000;
const MAX_MODELS_PER_DAY = 8;
const ZERO: Counters = { i: 0, o: 0, cr: 0, cw: 0, r: 0 };

export const newState = (provider: ParseState['provider']): ParseState => ({
  provider,
  days: {},
  lastId: null,
  lastUsage: null,
  total: null,
  model: null,
  lastAt: null,
});

/** Tokens a bucket or delta counts as spent: everything but cache reads. */
export const fresh = (c: Counters) => c.i + c.o + c.cw + c.r;

function bucketOf(state: ParseState, day: string): Bucket {
  return (state.days[day] ??= { ...ZERO, req: 0, tools: 0, ms: 0, m: {} });
}

function addTokens(state: ParseState, day: string, delta: Counters, model: string | null) {
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
function touch(state: ParseState, at: number, day: string) {
  if (state.lastAt !== null && at > state.lastAt) {
    if (at - state.lastAt <= ACTIVE_GAP_MS) bucketOf(state, day).ms += at - state.lastAt;
    state.lastAt = at;
  } else state.lastAt ??= at;
}

const TS = Buffer.from('"timestamp":"');
/** The line's timestamp (epoch ms), searched from `near` first because Claude writes it after the usage. */
function timestampOf(data: Buffer, near: number, start: number, end: number): number | null {
  let at = data.indexOf(TS, near);
  if (at < 0 || at >= end) at = data.indexOf(TS, start);
  if (at < 0 || at >= end) return null;
  const t = Date.parse(data.toString('utf8', at + TS.length, at + TS.length + 24));
  return Number.isFinite(t) ? t : null;
}

// ---- Claude: message.usage on assistant lines -------------------------------------------------------------------
const USAGE = Buffer.from('"usage":{');
const TOOL_USE = Buffer.from('"type":"tool_use"');
const MESSAGE_ID = /"message":\{[^{}]{0,300}?"id":"([^"]+)"/;
const MESSAGE_MODEL = /"message":\{[^{}]{0,300}?"model":"([^"]+)"/;
const CLAUDE_KEYS: Record<string, keyof Counters> = {
  input_tokens: 'i',
  cache_creation_input_tokens: 'cw',
  cache_read_input_tokens: 'cr',
  output_tokens: 'o',
};
const CLAUDE_COUNTER =
  /"(input_tokens|cache_creation_input_tokens|cache_read_input_tokens|output_tokens)":(\d+)/g;

function claudeCounters(text: string): Counters {
  const c = { ...ZERO };
  for (const m of text.matchAll(CLAUDE_COUNTER)) c[CLAUDE_KEYS[m[1]!]!] ||= Number(m[2]);
  return c;
}

function countOf(data: Buffer, needle: Buffer, from: number, to: number): number {
  let n = 0;
  for (let at = data.indexOf(needle, from); at >= 0 && at < to; at = data.indexOf(needle, at + 1))
    n++;
  return n;
}

function parseClaude(state: ParseState, data: Buffer, dayOf: DayOf) {
  let from = 0;
  while (from < data.length) {
    const hit = data.indexOf(USAGE, from);
    if (hit < 0) break;
    const start = data.lastIndexOf(10, hit) + 1; // -1 + 1: the first line
    const stop = data.indexOf(10, hit);
    const end = stop < 0 ? data.length : stop;
    from = end + 1;
    const head = data.toString('utf8', start, Math.min(start + 900, end));
    const id = MESSAGE_ID.exec(head)?.[1];
    const at = timestampOf(data, hit, start, end);
    // A usage that is not a message's own (a sub-agent's result, say) has no message id: it was counted where it ran.
    if (id === undefined || at === null) continue;
    const day = dayOf(at);
    const counters = claudeCounters(
      data.toString('utf8', hit + USAGE.length, Math.min(hit + 700, end)),
    );
    const model = MESSAGE_MODEL.exec(head)?.[1];
    const named = model && !model.startsWith('<') ? model : null;
    const again = id === state.lastId && state.lastUsage !== null;
    const prev = again ? state.lastUsage! : ZERO;
    addTokens(
      state,
      day,
      {
        i: Math.max(0, counters.i - prev.i),
        o: Math.max(0, counters.o - prev.o),
        cr: Math.max(0, counters.cr - prev.cr),
        cw: Math.max(0, counters.cw - prev.cw),
        r: 0,
      },
      named ?? state.model,
    );
    if (named) state.model = named;
    state.lastId = id;
    state.lastUsage = {
      i: Math.max(prev.i, counters.i),
      o: Math.max(prev.o, counters.o),
      cr: Math.max(prev.cr, counters.cr),
      cw: Math.max(prev.cw, counters.cw),
      r: 0,
    };
    const bucket = bucketOf(state, day);
    if (!again) bucket.req++;
    bucket.tools += countOf(data, TOOL_USE, start, hit);
    touch(state, at, day);
  }
}

// ---- Codex: token_count events (cumulative and per request), turn_context for the model -------------------------
const TOKEN_COUNT = Buffer.from('"payload":{"type":"token_count"');
const TURN_CONTEXT = Buffer.from('"type":"turn_context"');
const TOOL_CALLS = ['function_call', 'custom_tool_call', 'local_shell_call'].map((t) =>
  Buffer.from(`"payload":{"type":"${t}"`),
);
const MODEL = /"model":"([^"]+)"/;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/** Codex counts cached input and reasoning inside input and output; the buckets keep the parts apart. */
function codexCounters(usage: Record<string, unknown>): Counters {
  const cr = num(usage['cached_input_tokens']);
  const cw = num(usage['cache_write_input_tokens']);
  const r = num(usage['reasoning_output_tokens']);
  return {
    i: Math.max(0, num(usage['input_tokens']) - cr - cw),
    o: Math.max(0, num(usage['output_tokens']) - r),
    cr,
    cw,
    r,
  };
}

const sum = (c: Counters) => c.i + c.o + c.cr + c.cw + c.r;
const minus = (a: Counters, b: Counters): Counters => ({
  i: a.i - b.i,
  o: a.o - b.o,
  cr: a.cr - b.cr,
  cw: a.cw - b.cw,
  r: a.r - b.r,
});

/**
 * The tokens one token_count adds. The total only grows, so the difference to the previous total is the spend; an
 * unchanged total is a repeat and adds nothing; a total that fell (the session was reset or compacted) or the first one
 * seen counts the request's own usage, so a session continued from another's history does not claim that history.
 */
export function deltaOf(
  previous: Counters | null,
  total: Counters,
  last: Counters | null,
): Counters {
  if (previous === null) return last ?? total;
  const diff = minus(total, previous);
  if (sum(total) < sum(previous)) return last ?? total;
  return {
    i: Math.max(0, diff.i),
    o: Math.max(0, diff.o),
    cr: Math.max(0, diff.cr),
    cw: Math.max(0, diff.cw),
    r: Math.max(0, diff.r),
  };
}

function lineAround(data: Buffer, hit: number) {
  const start = data.lastIndexOf(10, hit) + 1;
  const stop = data.indexOf(10, hit);
  return { start, end: stop < 0 ? data.length : stop };
}

function codexTokenCount(state: ParseState, line: string, at: number, day: string) {
  let payload: Record<string, unknown>;
  try {
    payload = obj(obj(JSON.parse(line))['payload']);
  } catch {
    return; // a line cut in half
  }
  const info = obj(payload['info']);
  const totalUsage = obj(info['total_token_usage']);
  if (!Object.keys(totalUsage).length) return; // rate limits only
  const total = codexCounters(totalUsage);
  const lastUsage = obj(info['last_token_usage']);
  const delta = deltaOf(
    state.total,
    total,
    Object.keys(lastUsage).length ? codexCounters(lastUsage) : null,
  );
  state.total = total;
  if (sum(delta) === 0) return;
  addTokens(state, day, delta, state.model);
  bucketOf(state, day).req++;
  touch(state, at, day);
}

function parseCodex(state: ParseState, data: Buffer, dayOf: DayOf) {
  // Two kinds of record decide each other's meaning, so they are visited in file order.
  let nextCount = data.indexOf(TOKEN_COUNT);
  let nextContext = data.indexOf(TURN_CONTEXT);
  while (nextCount >= 0 || nextContext >= 0) {
    const context = nextContext >= 0 && (nextCount < 0 || nextContext < nextCount);
    const hit = context ? nextContext : nextCount;
    const { start, end } = lineAround(data, hit);
    if (context) {
      const model = MODEL.exec(data.toString('utf8', hit, Math.min(end, hit + 2000)))?.[1];
      if (model) state.model = model;
      nextContext = data.indexOf(TURN_CONTEXT, end + 1);
    } else {
      const at = timestampOf(data, start, start, end);
      if (at !== null) codexTokenCount(state, data.toString('utf8', start, end), at, dayOf(at));
      nextCount = data.indexOf(TOKEN_COUNT, end + 1);
    }
  }
  for (const needle of TOOL_CALLS)
    for (let at = data.indexOf(needle); at >= 0;) {
      const { start, end } = lineAround(data, at);
      const when = timestampOf(data, start, start, end);
      if (when !== null) bucketOf(state, dayOf(when)).tools++;
      at = data.indexOf(needle, end + 1);
    }
}

/** Adds the whole lines of `data` (appended since the last call) to `state`. */
export function parseChunk(state: ParseState, data: Buffer, dayOf: DayOf): void {
  if (state.provider === 'claude') parseClaude(state, data, dayOf);
  else parseCodex(state, data, dayOf);
}

/** The local calendar day of an instant in `timeZone`, remembered per quarter hour so each event costs a lookup. */
export function dayKeyOf(timeZone: string): DayOf {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const memo = new Map<number, string>();
  return (ms) => {
    const slot = Math.floor(ms / 900_000);
    let day = memo.get(slot);
    if (day === undefined) {
      day = format.format(slot * 900_000);
      if (memo.size > 4096) memo.clear();
      memo.set(slot, day);
    }
    return day;
  };
}
