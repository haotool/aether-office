import { stat } from 'node:fs/promises';
import { cleanTitle } from '@aether/kernel';
import { readEdge } from '../platform/file-edge.js';
import { redactSecrets } from '../platform/redaction.js';

// A Codex session without a thread name (every `codex exec` run) is titled by its task's opening words, stripped of
// credentials, for owners and operators only. Never stored or logged.
const TAIL_BYTES = 256 * 1024;
const HEAD_BYTES = 512 * 1024;
const MAX_TOPIC = 400;

const TITLE_LENGTH = 80;

export function topicTitle(topic: string | null): string | null {
  if (!topic) return null;
  return cleanTitle(redactSecrets(topic), TITLE_LENGTH + 1) || null;
}

const clip = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC) : null;
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

export function claudeTopic(tail: string): string | null {
  for (const line of tail.split('\n').reverse()) {
    if (!line.includes('"last-prompt"')) continue;
    try {
      const entry = obj(JSON.parse(line));
      if (entry['type'] === 'last-prompt') return clip(entry['lastPrompt']);
    } catch {
      /* cut line */
    }
  }
  return null;
}

const INJECTED = /^(<|# AGENTS\.md|AGENTS\.md instructions|<environment)/i;

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

const read = (file: string, where: 'head' | 'tail', bytes: number) => readEdge(file, where, bytes);

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
