import { stat } from 'node:fs/promises';
import { deleteOldest } from '../platform/oldest-entry.js';
import { withEdge } from '../platform/file-edge.js';

/**
 * Tool id -> true when the call succeeded, false when it failed, read from the tail of a provider's own transcript.
 * Only ids and outcomes are kept, and an outcome is never guessed: an id the tail does not hold, or a result that does
 * not say, is absent.
 */
const TAIL_BYTES = 256 * 1024;
const MAX_LINE_BYTES = 512 * 1024;
const MAX_OUTCOMES = 400;
const MAX_CACHED_FILES = 256;
const EXIT_TEXT = /^(?:Exit code:?|Process exited with code)\s+(-?\d+)/;

export type Outcomes = ReadonlyMap<string, boolean>;

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const exit = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v === 0 : undefined);

export function exitStatusOf(output: unknown): boolean | undefined {
  if (Array.isArray(output)) {
    for (const part of output) {
      const status = exitStatusOf(obj(part)['text']);
      if (status !== undefined) return status;
    }
    return undefined;
  }
  if (typeof output !== 'string') return undefined;
  const text = output.trimStart();
  if (text.startsWith('{')) {
    try {
      const json = obj(JSON.parse(text));
      return exit(obj(json['metadata'])['exit_code']) ?? exit(json['exit_code']);
    } catch {
      return undefined;
    }
  }
  const code = EXIT_TEXT.exec(text)?.[1];
  return code === undefined ? undefined : Number(code) === 0;
}

function refreshOutcomeNeedles(
  tail: Buffer,
  needles: readonly string[],
  from: number,
  next: number[],
): void {
  next.forEach((at, i) => {
    const needle = needles[i];
    if (needle !== undefined && at !== -1 && at < from) next[i] = tail.indexOf(needle, from);
  });
}

function lineBoundsAtNeedle(tail: Buffer, hit: number): { start: number; end: number } {
  const start = tail.lastIndexOf(10, hit) + 1;
  const stop = tail.indexOf(10, hit);
  return { start, end: stop < 0 ? tail.length : stop };
}

function claudeOutcomesFromEntry(
  entry: Record<string, unknown>,
  found: Map<string, boolean>,
): void {
  const content = obj(entry['message'])['content'];
  for (const block of Array.isArray(content) ? content : []) {
    const b = obj(block);
    if (
      b['type'] === 'tool_result' &&
      typeof b['tool_use_id'] === 'string' &&
      typeof b['is_error'] === 'boolean'
    )
      found.set(b['tool_use_id'], !b['is_error']);
  }
}

function codexOutcomeFromEntry(entry: Record<string, unknown>, found: Map<string, boolean>): void {
  const p = obj(entry['payload']);
  const status = exitStatusOf(p['output']);
  if (typeof p['call_id'] === 'string' && status !== undefined) found.set(p['call_id'], status);
}

function mergeOutcomeLine(
  provider: 'claude' | 'codex',
  tail: Buffer,
  start: number,
  end: number,
  found: Map<string, boolean>,
): void {
  if (end - start > MAX_LINE_BYTES) return;
  try {
    const entry = obj(JSON.parse(tail.toString('utf8', start, end)));
    if (provider === 'claude') claudeOutcomesFromEntry(entry, found);
    else codexOutcomeFromEntry(entry, found);
  } catch {
    /* a line cut in half, or not JSON */
  }
}

export function parseOutcomes(provider: 'claude' | 'codex', tail: Buffer): Map<string, boolean> {
  const found = new Map<string, boolean>();
  const needles =
    provider === 'claude'
      ? ['"tool_result"']
      : ['function_call_output"', 'custom_tool_call_output"'];
  let from = 0;
  const next = needles.map(() => -2);
  while (from < tail.length) {
    refreshOutcomeNeedles(tail, needles, from, next);
    const hits = next.filter((i) => i >= 0);
    if (!hits.length) break;
    const hit = Math.min(...hits);
    const { start, end } = lineBoundsAtNeedle(tail, hit);
    from = end + 1;
    mergeOutcomeLine(provider, tail, start, end, found);
  }
  while (found.size > MAX_OUTCOMES) deleteOldest(found);
  return found;
}

const cache = new Map<string, { mtime: number; size: number; outcomes: Outcomes }>();
export const resetOutcomeCache = () => cache.clear();

export async function readOutcomes(provider: 'claude' | 'codex', file: string): Promise<Outcomes> {
  try {
    const { mtimeMs, size } = await stat(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === mtimeMs && hit.size === size) return hit.outcomes;
    const outcomes = await withEdge(file, 'tail', TAIL_BYTES, (data) =>
      parseOutcomes(provider, data),
    );
    if (cache.size >= MAX_CACHED_FILES) deleteOldest(cache);
    cache.set(file, { mtime: mtimeMs, size, outcomes });
    return outcomes;
  } catch {
    return new Map();
  }
}
