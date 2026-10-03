import { open, stat } from 'node:fs/promises';

// What a session was asked to do, used ONLY to classify it. The text is cut short, handed to the classifier on the server
// and dropped: it is never stored, logged or returned to a client.
const TAIL_BYTES = 256 * 1024;
const HEAD_BYTES = 512 * 1024;
const MAX_TOPIC = 400;

const clip = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC) : null;
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

/** Pure. Claude Code records the latest prompt as a `last-prompt` entry. */
export function claudeTopic(tail: string): string | null {
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]!.includes('"last-prompt"')) continue;
    try {
      const entry = obj(JSON.parse(lines[i]!));
      if (entry['type'] === 'last-prompt') return clip(entry['lastPrompt']);
    } catch {
      /* cut line */
    }
  }
  return null;
}

// Context Codex injects before the user's own words (instructions, environment) is not the task.
const INJECTED = /^(<|# AGENTS\.md|AGENTS\.md instructions|<environment)/i;

/** Pure. The first thing the user said in a Codex rollout. */
export function codexTopic(head: string): string | null {
  for (const line of head.split('\n')) {
    if (!line.includes('"user"')) continue;
    try {
      const entry = obj(JSON.parse(line));
      const payload = obj(entry['payload']);
      if (entry['type'] !== 'response_item' || payload['role'] !== 'user') continue;
      const content = Array.isArray(payload['content']) ? payload['content'] : [];
      for (const part of content) {
        const text = clip(obj(part)['text']);
        if (text && !INJECTED.test(text)) return text;
      }
    } catch {
      /* cut line */
    }
  }
  return null;
}

async function read(file: string, where: 'head' | 'tail', bytes: number): Promise<string> {
  const { size } = await stat(file);
  const length = Math.min(size, bytes);
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, where === 'head' ? 0 : size - length);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

const cache = new Map<string, { mtime: number; size: number; topic: string | null }>();
export async function readTopic(
  provider: 'claude' | 'codex',
  file: string,
): Promise<string | null> {
  try {
    const { mtimeMs, size } = await stat(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === mtimeMs && hit.size === size) return hit.topic;
    const topic =
      provider === 'claude'
        ? claudeTopic(await read(file, 'tail', TAIL_BYTES))
        : codexTopic(await read(file, 'head', HEAD_BYTES));
    if (cache.size > 512) cache.clear();
    cache.set(file, { mtime: mtimeMs, size, topic });
    return topic;
  } catch {
    return null;
  }
}
