import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanTitle } from '@aether/kernel';
import { readEdge } from './file-edge.js';

// The title each provider already stores for its own session picker: Claude Code's `ai-title` entry in the
// transcript and Codex's `thread_name` in session_index.jsonl. Nothing else of the conversation is read.
const TAIL_BYTES = 256 * 1024;
const INDEX_BYTES = 2 * 1024 * 1024;
const MAX_TITLE = 120;

/** A title is one line of plain text: markup, Markdown, invisible characters and open brackets are gone (kernel `cleanTitle`). */
const clean = (v: unknown) => (typeof v === 'string' ? cleanTitle(v, MAX_TITLE) || null : null);

/** Pure. The latest `ai-title` in a transcript tail. */
export function parseClaudeTitle(tail: string): string | null {
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]!.includes('"ai-title"')) continue;
    try {
      const entry = JSON.parse(lines[i]!) as { type?: unknown; aiTitle?: unknown };
      if (entry.type === 'ai-title') return clean(entry.aiTitle);
    } catch {
      /* cut line */
    }
  }
  return null;
}

/** Pure. thread id → name from session_index.jsonl, the last entry for an id winning. */
export function parseCodexIndex(text: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const line of text.split('\n')) {
    try {
      const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
      const name = clean(entry.thread_name);
      if (typeof entry.id === 'string' && name) names.set(entry.id, name);
    } catch {
      /* cut or foreign line */
    }
  }
  return names;
}

const tail = (file: string, bytes: number) => readEdge(file, 'tail', bytes);

const claudeCache = new Map<string, { mtime: number; size: number; title: string | null }>();
export async function readClaudeTitle(file: string): Promise<string | null> {
  try {
    const { mtimeMs, size } = await stat(file);
    const hit = claudeCache.get(file);
    if (hit && hit.mtime === mtimeMs && hit.size === size) return hit.title;
    const title = parseClaudeTitle(await tail(file, TAIL_BYTES));
    if (claudeCache.size > 512) claudeCache.clear();
    claudeCache.set(file, { mtime: mtimeMs, size, title });
    return title;
  } catch {
    return null;
  }
}

let codexCache: { mtime: number; size: number; names: Map<string, string> } | null = null;
export async function readCodexTitles(home: string): Promise<Map<string, string>> {
  const file = join(home, '.codex', 'session_index.jsonl');
  try {
    const { mtimeMs, size } = await stat(file);
    if (codexCache?.mtime === mtimeMs && codexCache.size === size) return codexCache.names;
    const names = parseCodexIndex(await tail(file, INDEX_BYTES));
    codexCache = { mtime: mtimeMs, size, names };
    return names;
  } catch {
    return new Map();
  }
}
