import { open, stat } from 'node:fs/promises';
import { withEdge } from './file-edge.js';
import type { LocalSession } from '@aether/contracts';
import { compactedAtOf } from './session-context.js';

// Model, context size and spend from a provider transcript. Only counters and the model name are read:
// no message text is parsed out, kept or returned.
type SessionUsage = LocalSession['usage'];
// Read windows, narrowest first. A long Codex turn can push its last turn_context (which names the model) out of the first.
const TAILS = [128 * 1024, 512 * 1024, 2 * 1024 * 1024];
const NONE: SessionUsage = {
  model: null,
  contextTokens: null,
  contextWindow: null,
  contextPct: null,
  compactedAt: null,
  freshTokens: null,
  limit: null,
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/**
 * The lines of `data` that hold one of `needles`, last first, decoded one at a time. Everything else (megabytes of tool
 * output) is skipped as bytes, never turned into text; stopping early costs nothing.
 */
export function* linesWithFromEnd(data: Buffer, needles: readonly string[]): Generator<string> {
  let limit = data.length;
  while (limit > 0) {
    const hit = Math.max(...needles.map((needle) => data.lastIndexOf(needle, limit - 1)));
    if (hit < 0) return;
    const start = data.lastIndexOf(10, hit) + 1; // -1 + 1: the first line
    const stop = data.indexOf(10, hit);
    yield data.toString('utf8', start, stop < 0 ? data.length : stop);
    limit = start;
  }
}

/**
 * Pure. Codex: the latest token_count that carries info (the latest request's input is the context in use, the
 * cumulative total is the session's spend) and the model of the turn_context before it. Claude: the latest assistant
 * message's usage (new + cached input is the context in use). Absent or malformed → null, never zero.
 */
export function parseUsage(provider: 'claude' | 'codex', tail: Buffer): SessionUsage {
  const usage = { ...NONE, compactedAt: compactedAtOf(provider, tail) };
  const needles = provider === 'claude' ? ['"usage"'] : ['"token_count"', '"turn_context"'];
  for (const line of linesWithFromEnd(tail, needles)) {
    let entry: Record<string, unknown>;
    try {
      entry = obj(JSON.parse(line));
    } catch {
      continue; // the first line of a tail read is usually cut in half
    }
    const payload = obj(entry['payload']);
    if (provider === 'codex') {
      if (usage.contextTokens === null && payload['type'] === 'token_count' && payload['info']) {
        const info = obj(payload['info']);
        usage.contextTokens = num(obj(info['last_token_usage'])['input_tokens']);
        const total = obj(info['total_token_usage']);
        const spent = num(total['total_tokens']);
        // Codex's input count includes what the cache served, so those tokens come off the total.
        usage.freshTokens =
          spent === null ? null : Math.max(0, spent - (num(total['cached_input_tokens']) ?? 0));
        usage.contextWindow = num(info['model_context_window']);
      }
      if (usage.limit === null && payload['type'] === 'token_count' && payload['rate_limits']) {
        const limits = obj(payload['rate_limits']);
        const primary = obj(limits['primary']);
        const used = num(primary['used_percent']);
        if (used !== null)
          usage.limit = {
            usedPercent: Math.min(100, used),
            windowMinutes: num(primary['window_minutes']),
            resetsAt: num(primary['resets_at']) === null ? null : num(primary['resets_at'])! * 1000,
            plan: typeof limits['plan_type'] === 'string' ? limits['plan_type'] : null,
          };
      }
      if (entry['type'] === 'turn_context' && typeof payload['model'] === 'string') {
        usage.model ??= payload['model'];
      }
    } else {
      const message = obj(entry['message']);
      const u = obj(message['usage']);
      if (usage.contextTokens === null && Object.keys(u).length) {
        const parts = [
          'input_tokens',
          'cache_creation_input_tokens',
          'cache_read_input_tokens',
        ].map((k) => num(u[k]));
        usage.contextTokens = parts.some((p) => p !== null)
          ? parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
          : null;
        if (typeof message['model'] === 'string') usage.model = message['model'];
      }
    }
    if (
      usage.contextTokens !== null &&
      usage.model !== null &&
      (provider === 'claude' || usage.limit !== null)
    )
      break;
  }
  return usage;
}

const cache = new Map<string, { mtime: number; size: number; usage: SessionUsage }>();

/** Reads a transcript's usage, re-reading only when the file changed since the last look. */
export async function readUsage(provider: 'claude' | 'codex', file: string): Promise<SessionUsage> {
  try {
    const { mtimeMs, size } = await stat(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === mtimeMs && hit.size === size) return hit.usage;
    const read = (bytes: number) =>
      withEdge(file, 'tail', bytes, (data) => parseUsage(provider, data));
    // Most transcripts name the model in their last few records: widen the window only while it is still missing.
    let usage = NONE;
    for (let i = 0; i < TAILS.length; i++) {
      if (i > 0 && (usage.model !== null || size <= TAILS[i - 1]!)) break;
      usage = await read(TAILS[i]!);
    }
    if (provider === 'claude') usage = { ...usage, freshTokens: await claudeTotal(file, size) };
    if (cache.size > 512) cache.clear(); // bounded by design
    cache.set(file, { mtime: mtimeMs, size, usage });
    return usage;
  } catch {
    return NONE;
  }
}

// Cache reads are not counted (see LocalSession.usage.freshTokens): new input, input written to the cache, and output.
const USAGE_KEYS = ['input_tokens', 'cache_creation_input_tokens', 'output_tokens'] as const;
const USAGE_COUNTERS = USAGE_KEYS.map((key) => new RegExp(`"${key}":(\\d+)`));

/**
 * Pure. Claude Code keeps no running total, so a session's spend is the sum of every assistant message's new input,
 * cache-written input and output; the same measure as Codex's total_token_usage minus its cached input. `data` is whole lines. One message is written as
 * several lines repeating its usage, so a message counts once, by id; `lastId` carries that across chunks.
 *
 * Most of a transcript is tool output and thinking, and a line can be tens of KB, so nothing is decoded but the few
 * hundred bytes holding a message's id and counters (JSON.parse of every line is what filled memory). Lines whose
 * usage is not a message's own (a sub-agent's result, say) carry no message id and are skipped.
 */
export function sumClaudeTokens(data: Buffer, lastId: string | null) {
  let tokens = 0;
  let from = 0;
  while (from < data.length) {
    const hit = data.indexOf('"usage":{', from);
    if (hit < 0) break;
    const start = data.lastIndexOf(10, hit) + 1; // -1 + 1: the first line
    const stop = data.indexOf(10, hit);
    const lineEnd = stop < 0 ? data.length : stop;
    from = lineEnd + 1;
    const head = data.toString('utf8', start, Math.min(start + 900, lineEnd));
    const id = /"message":\{[^{}]{0,300}?"id":"([^"]+)"/.exec(head)?.[1];
    if (id === undefined || id === lastId) continue;
    lastId = id;
    // The message's own counters come first; the per-iteration copies that follow are not added again.
    const counters = data.toString('utf8', hit + 9, Math.min(hit + 9 + 400, lineEnd));
    for (const counter of USAGE_COUNTERS) tokens += Number(counter.exec(counters)?.[1] ?? 0);
  }
  return { tokens, lastId };
}

const CHUNK = 4 * 1024 * 1024;
// One buffer for every file, so files are summed one at a time: a buffer per file kept hundreds of MB resident.
const chunk = Buffer.allocUnsafe(CHUNK);
let sums: Promise<unknown> = Promise.resolve();
type Total = { offset: number; tokens: number; lastId: string | null };
const totals = new Map<string, Total>();
/** A Claude transcript's running total, reading only what was appended since the last call. */
function claudeTotal(file: string, size: number): Promise<number> {
  const next = sums.then(() => sumFile(file, size));
  sums = next.catch(() => 0);
  return next;
}

async function sumFile(file: string, size: number): Promise<number> {
  let state: Total | undefined = totals.get(file);
  if (!state || size < state.offset) state = { offset: 0, tokens: 0, lastId: null };
  const handle = await open(file, 'r');
  try {
    const buffer = chunk;
    while (state.offset < size) {
      const { bytesRead }: { bytesRead: number } = await handle.read(
        buffer,
        0,
        Math.min(CHUNK, size - state.offset),
        state.offset,
      );
      if (!bytesRead) break;
      const end: number = buffer.lastIndexOf(10, bytesRead - 1); // only whole lines; the rest is read next time
      if (end < 0) {
        if (bytesRead < CHUNK) break; // an unfinished last line: wait for the rest
        state = { ...state, offset: state.offset + bytesRead }; // one line longer than a chunk: step over it
        continue;
      }
      const sum = sumClaudeTokens(buffer.subarray(0, end), state.lastId);
      state = {
        offset: state.offset + end + 1,
        tokens: state.tokens + sum.tokens,
        lastId: sum.lastId,
      };
    }
  } finally {
    await handle.close();
  }
  if (totals.size > 512) totals.clear();
  totals.set(file, state);
  return state.tokens;
}
