import { open, stat } from 'node:fs/promises';
import type { LocalSession } from '@aether/contracts';

// Model and context size from the tail of a provider transcript. Only counters and the model name are read:
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
    if (usage.contextTokens !== null && usage.model !== null) break;
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
    if (cache.size > 512) cache.clear(); // bounded by design
    cache.set(file, { mtime: mtimeMs, size, usage });
    return usage;
  } catch {
    return NONE;
  }
}
