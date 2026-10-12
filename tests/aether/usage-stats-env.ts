import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { type Attribution } from '../../apps/control/src/services/usage/usage-aggregate.js';
import { createUsageStats } from '../../apps/control/src/services/usage/usage-stats.js';

export const NOW = Date.parse('2026-10-07T12:00:00Z');

export const touch = (file: string, at = NOW - 60_000) => utimesSync(file, at / 1000, at / 1000);
export const A = (department: string | null, repo = 'repo'): Attribution => ({ department, repo });

export function usageEnv() {
  const env = { home: '', clock: NOW };
  beforeEach(() => {
    env.home = mkdtempSync(join(tmpdir(), 'aether-usage-'));
    env.clock = NOW;
  });
  afterEach(() => rmSync(env.home, { recursive: true, force: true }));
  const stats = (extra: Partial<Parameters<typeof createUsageStats>[0]> = {}) =>
    createUsageStats({ home: env.home, timeZone: 'UTC', now: () => env.clock, ...extra });
  async function look(
    s: ReturnType<typeof createUsageStats>,
    attributions = new Map<string, Attribution>(),
  ) {
    env.clock += 10_000;
    await s.refresh(10_000);
    return s.snapshot('30d', attributions, null);
  }
  return { env, stats, look };
}
