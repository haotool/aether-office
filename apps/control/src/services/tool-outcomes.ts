import { stat } from 'node:fs/promises';
import { withEdge } from './file-edge.js';

/**
 * How tool calls ended, read from the tail of a provider's own transcript: tool id -> `true` when it succeeded, `false`
 * when it failed. Only the ids and the outcome are kept; no output text leaves this module. An id the tail does not hold,
 * or a result that does not say, is simply absent: an outcome is never guessed.
 *
 * Claude Code writes a `tool_result` block per call, with `is_error` when it knows (a command that exits non-zero is an error);
 * a block without the flag is skipped.
 * Codex writes `function_call_output` / `custom_tool_call_output` items keyed by `call_id`; when the output carries an exit
 * code it is read: a JSON object with `metadata.exit_code` or `exit_code` at its top level, or a text that begins with
 * `Exit code: N` / `Process exited with code N`.
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

/** Pure. Whether a Codex tool output says it succeeded: true, false, or undefined when it carries no exit code. */
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

/** Pure. The outcomes of the whole lines in a transcript tail (the first, usually cut, line fails to parse and is skipped). */
export function parseOutcomes(provider: 'claude' | 'codex', tail: Buffer): Map<string, boolean> {
  const found = new Map<string, boolean>();
  const needles =
    provider === 'claude'
      ? ['"tool_result"']
      : ['function_call_output"', 'custom_tool_call_output"'];
  let from = 0;
  const next = needles.map(() => -2); // each needle's next hit, searched again only once it is behind `from`
  while (from < tail.length) {
    next.forEach((at, i) => {
      if (at !== -1 && at < from) next[i] = tail.indexOf(needles[i]!, from);
    });
    const hits = next.filter((i) => i >= 0);
    if (!hits.length) break;
    const hit = Math.min(...hits);
    const start = tail.lastIndexOf(10, hit) + 1;
    const stop = tail.indexOf(10, hit);
    const end = stop < 0 ? tail.length : stop;
    from = end + 1;
    if (end - start > MAX_LINE_BYTES) continue;
    try {
      const entry = obj(JSON.parse(tail.toString('utf8', start, end)));
      if (provider === 'claude') {
        const content = obj(entry['message'])['content'];
        for (const block of Array.isArray(content) ? content : []) {
          const b = obj(block);
          // Only an explicit flag counts: a result without `is_error` says nothing about how the call ended.
          if (
            b['type'] === 'tool_result' &&
            typeof b['tool_use_id'] === 'string' &&
            typeof b['is_error'] === 'boolean'
          )
            found.set(b['tool_use_id'], !b['is_error']);
        }
      } else {
        const p = obj(entry['payload']);
        const status = exitStatusOf(p['output']);
        if (typeof p['call_id'] === 'string' && status !== undefined)
          found.set(p['call_id'], status);
      }
    } catch {
      /* a line cut in half, or not JSON */
    }
  }
  while (found.size > MAX_OUTCOMES) found.delete(found.keys().next().value!);
  return found;
}

const cache = new Map<string, { mtime: number; size: number; outcomes: Outcomes }>();
export const resetOutcomeCache = () => cache.clear();

/** The outcomes in a transcript's tail, read again only when the file changed. Empty when it cannot be read. */
export async function readOutcomes(provider: 'claude' | 'codex', file: string): Promise<Outcomes> {
  try {
    const { mtimeMs, size } = await stat(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === mtimeMs && hit.size === size) return hit.outcomes;
    const outcomes = await withEdge(file, 'tail', TAIL_BYTES, (data) =>
      parseOutcomes(provider, data),
    );
    if (cache.size >= MAX_CACHED_FILES) cache.delete(cache.keys().next().value!);
    cache.set(file, { mtime: mtimeMs, size, outcomes });
    return outcomes;
  } catch {
    return new Map();
  }
}
