import { open, stat } from 'node:fs/promises';
import { withEdge } from './file-edge.js';
import type { LocalSession } from '@aether/contracts';
import { compactedAtOf } from './session-context.js';
import { fresh, newState, parseChunk, type ParseState } from './usage-parse.js';

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

type Fields = Record<string, unknown>;

/** Codex: folds one `token_count` or `turn_context` record into `usage`, keeping what a later (earlier-in-file) line already set. */
function foldCodex(usage: SessionUsage, entry: Fields, payload: Fields) {
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
    const resetsAt = num(primary['resets_at']);
    if (used !== null)
      usage.limit = {
        usedPercent: Math.min(100, used),
        windowMinutes: num(primary['window_minutes']),
        resetsAt: resetsAt === null ? null : resetsAt * 1000,
        plan: typeof limits['plan_type'] === 'string' ? limits['plan_type'] : null,
      };
  }
  if (entry['type'] === 'turn_context' && typeof payload['model'] === 'string') {
    usage.model ??= payload['model'];
  }
}

/** Claude: folds one assistant message's usage into `usage` (new + cached input is the context in use). */
function foldClaude(usage: SessionUsage, entry: Fields) {
  const message = obj(entry['message']);
  const u = obj(message['usage']);
  // A placeholder the CLI writes for an API error (`<synthetic>`, all zeros) says nothing of the context: look further back.
  const placeholder =
    entry['isApiErrorMessage'] === true ||
    (typeof message['model'] === 'string' && message['model'].startsWith('<'));
  if (usage.contextTokens !== null || !Object.keys(u).length || placeholder) return;
  const parts = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].map(
    (k) => num(u[k]),
  );
  usage.contextTokens = parts.some((p) => p !== null)
    ? parts.reduce<number>((sum, p) => sum + (p ?? 0), 0)
    : null;
  if (typeof message['model'] === 'string') usage.model = message['model'];
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
    let entry: Fields;
    try {
      entry = obj(JSON.parse(line));
    } catch {
      continue; // the first line of a tail read is usually cut in half
    }
    if (provider === 'codex') foldCodex(usage, entry, obj(entry['payload']));
    else foldClaude(usage, entry);
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
    let previous = 0;
    for (const bytes of TAILS) {
      if (previous > 0 && (usage.model !== null || size <= previous)) break;
      usage = await read(bytes);
      previous = bytes;
    }
    if (provider === 'claude') usage = { ...usage, freshTokens: await claudeTotal(file, size) };
    if (cache.size > 512) cache.clear(); // bounded by design
    cache.set(file, { mtime: mtimeMs, size, usage });
    return usage;
  } catch {
    return NONE;
  }
}

// A Claude session's spend is summed by the same parser as the KPI dashboard (usage-parse.ts), over the whole file in one
// bucket: the two can never disagree. Cache reads are not counted (see LocalSession.usage.freshTokens).
const WHOLE_FILE = () => 'all';

const CHUNK = 4 * 1024 * 1024;
// One buffer for every file, so files are summed one at a time: a buffer per file kept hundreds of MB resident.
const chunk = Buffer.allocUnsafe(CHUNK);
let sums: Promise<unknown> = Promise.resolve();
type Total = { offset: number; state: ParseState };
const totals = new Map<string, Total>();
/** A Claude transcript's running total, reading only what was appended since the last call. */
function claudeTotal(file: string, size: number): Promise<number> {
  const next = sums.then(() => sumFile(file, size));
  sums = next.catch(() => 0);
  return next;
}

async function sumFile(file: string, size: number): Promise<number> {
  let state: Total | undefined = totals.get(file);
  if (!state || size < state.offset) state = { offset: 0, state: newState('claude') };
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
      parseChunk(state.state, buffer.subarray(0, end), WHOLE_FILE);
      state = { ...state, offset: state.offset + end + 1 };
    }
  } finally {
    await handle.close();
  }
  if (totals.size > 512) totals.clear();
  totals.set(file, state);
  return Object.values(state.state.days).reduce((n, b) => n + fresh(b), 0);
}
