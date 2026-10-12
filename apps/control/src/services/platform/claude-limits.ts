import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ClaudeLimits } from '@aether/contracts';

// Claude Code writes its 5-hour and 7-day subscription limits to no file. They only arrive through the claude-hud
// status line plugin, which caches the usage endpoint's answer in `.usage-cache.json`; this reads that cache.
const MAX_BYTES = 64 * 1024;
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
  if (resetsAt !== null && resetsAt <= now) return null;
  return { usedPercent, resetsAt };
}

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

const usageCacheFile = () =>
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
