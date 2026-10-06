import type { CodexLimits } from '@aether/contracts';
import { withEdge } from './file-edge.js';

// Codex writes its rate-limit windows into every token_count event of a session (`rate_limits.primary` and `.secondary`:
// used percent, window length in minutes, reset time). The latest such event of the newest sessions is the freshest
// reading this machine has; nothing is fetched and no credential is read.
const TAIL_BYTES = 256 * 1024;
const NEEDLE = Buffer.from('"rate_limits":{');
/** Newest rollouts looked into: a quiet one has no reading, an idle machine's newest may be days old. */
export const LIMIT_FILES = 4;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

function windowOf(raw: unknown, now: number): CodexLimits['windows'][number] | null {
  const w = obj(raw);
  const usedPercent = num(w['used_percent']);
  const resets = num(w['resets_at']);
  if (usedPercent === null) return null;
  // Once the reset has passed the figure describes a window that is over.
  if (resets !== null && resets * 1000 <= now) return null;
  return {
    minutes: num(w['window_minutes']),
    usedPercent,
    resetsAt: resets === null ? null : resets * 1000,
  };
}

/** Pure. The latest rate-limit reading in a transcript's tail: its windows, plan and when it was written. */
export function parseCodexLimits(tail: Buffer, now: number): CodexLimits | null {
  for (let from = tail.length; from > 0;) {
    const hit = tail.lastIndexOf(NEEDLE, from - 1);
    if (hit < 0) return null;
    const start = tail.lastIndexOf(10, hit) + 1;
    const stop = tail.indexOf(10, hit);
    from = start;
    let entry: Record<string, unknown>;
    try {
      entry = obj(JSON.parse(tail.toString('utf8', start, stop < 0 ? tail.length : stop)));
    } catch {
      continue; // the first line of a tail read is usually cut in half
    }
    const limits = obj(obj(entry['payload'])['rate_limits']);
    const at = Date.parse(String(entry['timestamp'] ?? ''));
    const windows = [limits['primary'], limits['secondary']].flatMap((w) => {
      const parsed = windowOf(w, now);
      return parsed ? [parsed] : [];
    });
    if (!windows.length || !Number.isFinite(at)) return null;
    const plan = limits['plan_type'];
    return {
      plan: typeof plan === 'string' && plan.trim() ? plan.trim().slice(0, 40) : null,
      windows: windows.sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0)),
      updatedAt: at,
    };
  }
  return null;
}

/** The freshest reading among the newest Codex transcripts (`files`, newest first); null when none carries one. */
export async function readCodexLimits(
  files: readonly string[],
  now: number,
): Promise<CodexLimits | null> {
  let best: CodexLimits | null = null;
  for (const file of files.slice(0, LIMIT_FILES)) {
    const found = await withEdge(file, 'tail', TAIL_BYTES, (data) =>
      parseCodexLimits(data, now),
    ).catch(() => null);
    if (found && (!best || found.updatedAt > best.updatedAt)) best = found;
  }
  return best;
}
