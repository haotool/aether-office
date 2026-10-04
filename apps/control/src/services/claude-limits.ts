import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ClaudeLimits } from '@aether/contracts';

// Claude Code keeps its 5-hour and 7-day subscription limits out of every file it writes. They reach this machine
// only through whatever fetched them: the claude-hud status line plugin asks Anthropic's usage endpoint about every
// five minutes while Claude Code runs and keeps the answer in `.usage-cache.json`. This reads that answer and nothing
// else. It never reads Claude's credential store and never calls the network itself (agent-deck, which feeds on the
// documented `rate_limits` status-line payload, makes the same choice; nimbalyst, which replays the OAuth token from
// the keychain, is the one deliberately not followed).
const MAX_BYTES = 64 * 1024;
/** The plugin refreshes about every 5 minutes while Claude Code is running; older than three of those is stale. */
export const STALE_MS = 15 * 60 * 1000;

const percent = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : null;
const instant = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};
const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

function window(used: unknown, resetAt: unknown, now: number) {
  const usedPercent = percent(used);
  const resetsAt = instant(resetAt);
  if (usedPercent === null) return null;
  // Once the reset has passed the figure describes a window that is over; saying nothing beats showing it.
  if (resetsAt !== null && resetsAt <= now) return null;
  return { usedPercent, resetsAt };
}

/**
 * Pure. The limits in a claude-hud cache file: the latest reading, or the last good one while the plugin is backing
 * off from a failed or rate-limited request. Null when the file holds no usable number.
 */
export function parseHudCache(text: string, now: number): ClaudeLimits | null {
  let cache: Record<string, unknown>;
  try {
    cache = obj(JSON.parse(text));
  } catch {
    return null;
  }
  const timestamp = typeof cache['timestamp'] === 'number' ? cache['timestamp'] : null;
  if (timestamp === null || timestamp > now + 60_000) return null;
  const latest = obj(cache['data']);
  const reading = latest['apiUnavailable'] ? obj(cache['lastGoodData']) : latest;
  const fiveHour = window(reading['fiveHour'], reading['fiveHourResetAt'], now);
  const sevenDay = window(reading['sevenDay'], reading['sevenDayResetAt'], now);
  if (!fiveHour && !sevenDay) return null;
  const plan = reading['planName'];
  return {
    plan: typeof plan === 'string' && plan.trim() ? plan.trim().slice(0, 40) : null,
    fiveHour,
    sevenDay,
    updatedAt: timestamp,
    stale: latest['apiUnavailable'] === true || now - timestamp > STALE_MS,
  };
}

/** Where the plugin keeps its cache: next to Claude Code's own config, or wherever AETHER_CLAUDE_USAGE_FILE points. */
export const usageCacheFile = () =>
  process.env['AETHER_CLAUDE_USAGE_FILE'] ??
  join(
    process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'),
    'plugins/claude-hud/.usage-cache.json',
  );

export async function readClaudeLimits(
  file = usageCacheFile(),
  now = Date.now(),
): Promise<ClaudeLimits | null> {
  try {
    if ((await stat(file)).size > MAX_BYTES) return null;
    return parseHudCache(await readFile(file, 'utf8'), now);
  } catch {
    return null; // no plugin, no cache yet: the top bar says so rather than inventing a figure
  }
}
