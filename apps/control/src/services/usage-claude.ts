// Claude transcripts: message.usage on assistant lines. One message is several lines repeating its usage, and a
// resumed or forked session copies earlier messages, so a message is counted once (see ClaimBook).
import {
  ZERO,
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

/**
 * Which Claude messages were already counted, and by whom. A resumed or forked session copies earlier messages (the same
 * id) into a file of its own; the copy adds only what the first reading did not. Memory only (a restart reads appended
 * bytes only, so ids of files already rolled up are not known again), and bounded: past the bound it forgets.
 */
const MAX_CLAIMED = 300_000;
export class ClaimBook {
  private seen = new Map<string, { owner: string; c: Counters }>();
  get(id: string): Counters | undefined {
    return this.seen.get(id)?.c;
  }
  set(id: string, owner: string, c: Counters) {
    if (!this.seen.has(id)) {
      if (this.seen.size >= MAX_CLAIMED) this.seen.clear();
      // A match out of a long string is a slice that keeps the whole string alive: kept ids are copied.
      id = Buffer.from(id).toString();
    }
    this.seen.set(id, { owner, c });
  }
  /** Forgets what `owners` counted: their files were rewritten or are gone, so their messages are counted again. */
  release(owners: ReadonlySet<string>) {
    for (const [id, claim] of this.seen) if (owners.has(claim.owner)) this.seen.delete(id);
  }
}
export type Claims = { book: ClaimBook; owner: string };

// ---- Claude: message.usage on assistant lines -------------------------------------------------------------------
const USAGE = Buffer.from('"usage"');
const ASSISTANT = Buffer.from('"assistant"');
/** A line longer than this that the fast path missed is counted as skipped rather than parsed. */
const MAX_FALLBACK_LINE = 1 << 20;
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
  for (const m of text.matchAll(CLAUDE_COUNTER)) {
    const slot = CLAUDE_KEYS[m[1] ?? ''];
    if (slot) c[slot] ||= Number(m[2]);
  }
  return c;
}

function countOf(data: Buffer, needle: Buffer, from: number, to: number): number {
  const span = data.subarray(from, to); // bounded: a search of the whole chunk for a needle that is absent is quadratic
  let n = 0;
  for (let at = span.indexOf(needle); at >= 0; at = span.indexOf(needle, at + 1)) n++;
  return n;
}

const maxOf = (a: Counters, b: Counters): Counters => ({
  i: Math.max(a.i, b.i),
  o: Math.max(a.o, b.o),
  cr: Math.max(a.cr, b.cr),
  cw: Math.max(a.cw, b.cw),
  r: 0,
});

type Msg = { id: string; model: string | undefined; counters: Counters; at: number; tools: number };

/** The byte fast path: compact JSON with the message id near the front. Null when the line is not of that shape. */
function fastMsg(data: Buffer, hit: number, start: number, end: number): Msg | null {
  if (data[hit + USAGE.length] !== 0x3a || data[hit + USAGE.length + 1] !== 0x7b) return null; // `:{`
  const head = data.toString('utf8', start, Math.min(start + 900, end));
  const id = MESSAGE_ID.exec(head)?.[1];
  const at = timestampOf(data, hit, start, end);
  if (id === undefined || at === null) return null;
  const counters = claudeCounters(
    data.toString('utf8', hit + USAGE.length, Math.min(hit + 700, end)),
  );
  return {
    id,
    model: MESSAGE_MODEL.exec(head)?.[1],
    counters,
    at,
    tools: countOf(data, TOOL_USE, start, hit),
  };
}

/** The tolerant path for one assistant line the fast path missed: any key order or spacing. Null when it has no usage. */
function slowMsg(text: string): Msg | null {
  let line: Record<string, unknown>;
  try {
    line = obj(JSON.parse(text));
  } catch {
    return null;
  }
  const message = obj(line['message']);
  const usage = obj(message['usage']);
  const at = typeof line['timestamp'] === 'string' ? Date.parse(line['timestamp']) : NaN;
  const id = message['id'];
  if (typeof id !== 'string' || !Number.isFinite(at) || !Object.keys(usage).length) return null;
  const counters = { ...ZERO };
  for (const [key, slot] of Object.entries(CLAUDE_KEYS)) counters[slot] = num(usage[key]);
  const content = Array.isArray(message['content']) ? (message['content'] as unknown[]) : [];
  return {
    id,
    model: typeof message['model'] === 'string' ? message['model'] : undefined,
    counters,
    at,
    tools: content.filter((c) => obj(c)['type'] === 'tool_use').length,
  };
}

/** Adds what of `msg` was not counted before, by this file or (through `claims`) by another. */
function countMessage(state: ParseState, msg: Msg, dayOf: DayOf, claims?: Claims) {
  const { id, counters, at } = msg;
  const day = dayOf(at);
  const model = msg.model;
  // A placeholder the CLI writes for an error (`<synthetic>`) is no request to a model and spent nothing.
  const synthetic = model?.startsWith('<') ?? false;
  const named = model && !synthetic ? model : null;
  // What of this message was counted already: by this file (the previous line, or any earlier one) or by another.
  const known =
    claims?.book.get(id) ?? (id === state.lastId ? (state.lastUsage ?? undefined) : undefined);
  const prev = known ?? ZERO;
  const delta = {
    i: Math.max(0, counters.i - prev.i),
    o: Math.max(0, counters.o - prev.o),
    cr: Math.max(0, counters.cr - prev.cr),
    cw: Math.max(0, counters.cw - prev.cw),
    r: 0,
  };
  addTokens(state, day, delta, named ?? state.model);
  if (named) state.model = named;
  state.lastId = id;
  state.lastUsage = maxOf(prev, counters);
  // The claim stays with whoever counted the message first, unless this copy goes further than it did.
  if (known === undefined || delta.i + delta.o + delta.cr + delta.cw > 0)
    claims?.book.set(id, claims.owner, state.lastUsage);
  const bucket = bucketOf(state, day);
  if (known === undefined && !synthetic) bucket.req++;
  bucket.tools += msg.tools;
  touch(state, at, day);
}

export function parseClaude(state: ParseState, data: Buffer, dayOf: DayOf, claims?: Claims) {
  let from = 0;
  while (from < data.length) {
    const hit = data.indexOf(USAGE, from);
    if (hit < 0) break;
    const start = data.lastIndexOf(10, hit) + 1; // -1 + 1: the first line
    const stop = data.indexOf(10, hit);
    const end = stop < 0 ? data.length : stop;
    from = end + 1;
    let msg = fastMsg(data, hit, start, end);
    if (msg === null) {
      // A usage that is not an assistant message's own (a sub-agent's result, say) was counted where it ran.
      if (!data.subarray(start, end).includes(ASSISTANT)) continue;
      if (end - start <= MAX_FALLBACK_LINE) {
        state.fallbacks++;
        msg = slowMsg(data.toString('utf8', start, end));
      }
      if (msg === null) {
        state.skipped++; // an assistant line with usage that neither path could place: counted, never silent
        continue;
      }
    }
    countMessage(state, msg, dayOf, claims);
  }
}
