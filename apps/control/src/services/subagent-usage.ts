import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { fresh, newState, parseChunk, type ParseState } from './usage-parse.js';

/**
 * What a Claude subagent's transcript says it spent and did, counted incrementally with the KPI parser (`usage-parse.ts`):
 * counters and tool-call markers only, no text decoded or kept. Each file is read from where the last look stopped, so a
 * long-running subagent costs its new bytes per scan, never its whole history again. Work per scan is bounded by a shared
 * byte budget: a file the budget did not reach yet reports nothing (null), never a partial total as if it were whole.
 */
const CHUNK = 1024 * 1024;
const SAMPLE_GAP_MS = 5000;
/** The rate is measured against the oldest sample within this window, and needs at least RATE_MIN_SPAN_MS of span. */
const RATE_WINDOW_MS = 70_000;
const RATE_MIN_SPAN_MS = 10_000;
const MAX_SAMPLES = 16;
const MAX_FILES = 256;
const ONE_BUCKET = () => 'all';

type Sample = { at: number; total: number };
type Entry = { state: ParseState; offset: number; samples: Sample[] };
export type SubagentUsage = { total: number; tools: number; perMinute: number };
/** Bytes this scan may still read across every file; shared so a crowd of subagents cannot stall one scan. */
export type ReadBudget = { bytes: number };

const entries = new Map<string, Entry>();
const buffer = Buffer.allocUnsafe(CHUNK);
let queue: Promise<unknown> = Promise.resolve(); // one shared buffer: files are read one at a time
export const resetSubagentUsage = () => entries.clear();

const totalOf = (state: ParseState) =>
  Object.values(state.days).reduce((sum, bucket) => sum + fresh(bucket), 0);
const toolsOf = (state: ParseState) =>
  Object.values(state.days).reduce((sum, bucket) => sum + bucket.tools, 0);

/** Reads what `file` gained, within the budget. Returns whether it is now read up to its end. */
async function advance(file: string, size: number, entry: Entry, budget: ReadBudget) {
  // Never a link, and never block on a pipe that replaced the file after it was listed.
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) return false;
    while (entry.offset < size) {
      const want = Math.min(CHUNK, size - entry.offset, budget.bytes);
      if (want <= 0) return false;
      const { bytesRead } = await handle.read(buffer, 0, want, entry.offset);
      if (!bytesRead) return true;
      budget.bytes -= bytesRead;
      const end = buffer.lastIndexOf(10, bytesRead - 1); // whole lines only; the rest is read next time
      if (end < 0) {
        if (bytesRead < CHUNK) return entry.offset + bytesRead >= size; // an unfinished last line: wait for the rest
        entry.offset += bytesRead; // one line longer than a chunk: step over it
        continue;
      }
      parseChunk(entry.state, buffer.subarray(0, end), ONE_BUCKET);
      entry.offset += end + 1;
    }
    return true;
  } finally {
    await handle.close();
  }
}

function rateOf(samples: readonly Sample[], total: number, now: number): number {
  const base = samples.find((s) => now - s.at <= RATE_WINDOW_MS);
  if (!base || now - base.at < RATE_MIN_SPAN_MS) return 0;
  return Math.max(0, Math.round(((total - base.total) / (now - base.at)) * 60_000));
}

/** Total tokens, tool calls and the tokens-per-minute rate of one subagent file; null while it is not read completely. */
export function readSubagentUsage(
  file: string,
  size: number,
  now: number,
  budget: ReadBudget,
): Promise<SubagentUsage | null> {
  const next = queue.then(async () => {
    let entry = entries.get(file);
    if (!entry || size < entry.offset)
      entry = { state: newState('claude'), offset: 0, samples: [] };
    if (entries.size >= MAX_FILES && !entries.has(file))
      entries.delete(entries.keys().next().value!); // the oldest only: the rest keep their offsets
    entries.set(file, entry);
    try {
      if (!(await advance(file, size, entry, budget))) return null;
    } catch {
      entries.delete(file); // vanished, a link, unreadable: no facts, and the scan goes on
      return null;
    }
    const total = totalOf(entry.state);
    const rate = rateOf(entry.samples, total, now);
    if (!entry.samples.length || now - entry.samples.at(-1)!.at >= SAMPLE_GAP_MS)
      entry.samples = [...entry.samples, { at: now, total }].slice(-MAX_SAMPLES);
    return { total, tools: toolsOf(entry.state), perMinute: rate };
  });
  queue = next.catch(() => undefined);
  return next;
}
