// Codex transcripts: token_count events (cumulative and per request), turn_context for the model.
import {
  addTokens,
  bucketOf,
  num,
  obj,
  timestampOf,
  touch,
  type Counters,
  type DayOf,
  type ParseState,
} from './usage-counters.js';

// ---- Codex: token_count events (cumulative and per request), turn_context for the model -------------------------
const TOKEN_COUNT = Buffer.from('"payload":{"type":"token_count"');
const TURN_CONTEXT = Buffer.from('"type":"turn_context"');
const TOOL_CALLS = ['function_call', 'custom_tool_call', 'local_shell_call'].map((t) =>
  Buffer.from(`"payload":{"type":"${t}"`),
);
const MODEL = /"model":"([^"]+)"/;

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
    state.skipped++; // a whole line that is not JSON
    return;
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

function applyCodexTurnContext(state: ParseState, data: Buffer, hit: number, end: number): number {
  const model = MODEL.exec(data.toString('utf8', hit, Math.min(end, hit + 2000)))?.[1];
  if (model) state.model = model;
  return data.indexOf(TURN_CONTEXT, end + 1);
}

function applyCodexTokenCount(
  state: ParseState,
  data: Buffer,
  start: number,
  end: number,
  dayOf: DayOf,
): number {
  const at = timestampOf(data, start, start, end);
  if (at === null) state.skipped++;
  else codexTokenCount(state, data.toString('utf8', start, end), at, dayOf(at));
  return data.indexOf(TOKEN_COUNT, end + 1);
}

function countCodexToolCalls(state: ParseState, data: Buffer, dayOf: DayOf): void {
  for (const needle of TOOL_CALLS)
    for (let at = data.indexOf(needle); at >= 0;) {
      const { start, end } = lineAround(data, at);
      const when = timestampOf(data, start, start, end);
      if (when !== null) bucketOf(state, dayOf(when)).tools++;
      at = data.indexOf(needle, end + 1);
    }
}

export function parseCodex(state: ParseState, data: Buffer, dayOf: DayOf) {
  let nextCount = data.indexOf(TOKEN_COUNT);
  let nextContext = data.indexOf(TURN_CONTEXT);
  while (nextCount >= 0 || nextContext >= 0) {
    const context = nextContext >= 0 && (nextCount < 0 || nextContext < nextCount);
    const hit = context ? nextContext : nextCount;
    const { start, end } = lineAround(data, hit);
    if (context) nextContext = applyCodexTurnContext(state, data, hit, end);
    else nextCount = applyCodexTokenCount(state, data, start, end, dayOf);
  }
  countCodexToolCalls(state, data, dayOf);
}
