import { open, stat } from 'node:fs/promises';
import type { LocalSession } from '@aether/contracts';

// Model, context size and spend from a provider transcript. Only counters and the model name are read:
// no message text is parsed out, kept or returned.
export type SessionUsage = LocalSession['usage'];
const TAIL_BYTES = 128 * 1024;
// A long Codex turn can push the last turn_context (which names the model) out of the first window.
const WIDE_TAIL_BYTES = 2 * 1024 * 1024;
const NONE: SessionUsage = {
  model: null,
  contextTokens: null,
  contextWindow: null,
  totalTokens: null,
  limit: null,
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/**
 * Pure. Codex: the latest token_count that carries info (the latest request's input is the context in use, the
 * cumulative total is the session's spend) and the model of the turn_context before it. Claude: the latest assistant
 * message's usage (new + cached input is the context in use). Absent or malformed → null, never zero.
 */
export function parseUsage(provider: 'claude' | 'codex', tail: string): SessionUsage {
  const usage = { ...NONE };
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: Record<string, unknown>;
    try {
      entry = obj(JSON.parse(lines[i]!));
    } catch {
      continue; // the first line of a tail read is usually cut in half
    }
    const payload = obj(entry['payload']);
    if (provider === 'codex') {
      if (usage.contextTokens === null && payload['type'] === 'token_count' && payload['info']) {
        const info = obj(payload['info']);
        usage.contextTokens = num(obj(info['last_token_usage'])['input_tokens']);
        usage.totalTokens = num(obj(info['total_token_usage'])['total_tokens']);
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
    const read = async (bytes: number) => {
      const length = Math.min(size, bytes);
      const handle = await open(file, 'r');
      try {
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, size - length);
        return parseUsage(provider, buffer.toString('utf8'));
      } finally {
        await handle.close();
      }
    };
    let usage = await read(TAIL_BYTES);
    if (usage.model === null && size > TAIL_BYTES) usage = await read(WIDE_TAIL_BYTES);
    if (provider === 'claude') usage = { ...usage, totalTokens: await claudeTotal(file, size) };
    if (cache.size > 512) cache.clear(); // bounded by design
    cache.set(file, { mtime: mtimeMs, size, usage });
    return usage;
  } catch {
    return NONE;
  }
}

/**
 * Pure. Claude Code keeps no running total, so a session's spend is the sum of every assistant message's input
 * (new and cached) and output, the same measure as Codex's total_token_usage. One message is written as several lines
 * repeating its usage, so a message counts once, by id; `lastId` carries that across chunks.
 */
export function sumClaudeTokens(lines: string, lastId: string | null) {
  let tokens = 0;
  for (const line of lines.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let message: Record<string, unknown>;
    try {
      message = obj(obj(JSON.parse(line))['message']);
    } catch {
      continue;
    }
    const id = typeof message['id'] === 'string' ? message['id'] : null;
    if (id !== null && id === lastId) continue;
    lastId = id;
    const u = obj(message['usage']);
    for (const k of [
      'input_tokens',
      'cache_creation_input_tokens',
      'cache_read_input_tokens',
      'output_tokens',
    ])
      tokens += num(u[k]) ?? 0;
  }
  return { tokens, lastId };
}

const CHUNK = 4 * 1024 * 1024;
type Total = { offset: number; tokens: number; lastId: string | null };
const totals = new Map<string, Total>();
/** A Claude transcript's running total, reading only what was appended since the last call. */
async function claudeTotal(file: string, size: number): Promise<number> {
  let state: Total | undefined = totals.get(file);
  if (!state || size < state.offset) state = { offset: 0, tokens: 0, lastId: null };
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(CHUNK);
    while (state.offset < size) {
      const { bytesRead }: { bytesRead: number } = await handle.read(
        buffer,
        0,
        Math.min(CHUNK, size - state.offset),
        state.offset,
      );
      if (!bytesRead) break;
      const end: number = buffer.lastIndexOf(10, bytesRead - 1); // only whole lines; the rest is read next time
      if (end < 0) break;
      const sum = sumClaudeTokens(buffer.toString('utf8', 0, end), state.lastId);
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
