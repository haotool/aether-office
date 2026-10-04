import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  STALE_MS,
  parseHudCache,
  readClaudeLimits,
} from '../../apps/control/src/services/claude-limits.js';

const NOW = Date.parse('2026-10-04T20:00:00Z');
const reading = {
  planName: 'Max',
  fiveHour: 3,
  sevenDay: 90,
  fiveHourResetAt: '2026-10-04T23:00:00Z',
  sevenDayResetAt: '2026-10-09T04:00:00Z',
};
const file = (data: object, extra: object = {}, at = NOW - 60_000) =>
  JSON.stringify({ data, timestamp: at, lastGoodData: data, ...extra });

it('reads both windows, the plan and when they were fetched', () => {
  expect(parseHudCache(file(reading), NOW)).toEqual({
    plan: 'Max',
    fiveHour: { usedPercent: 3, resetsAt: Date.parse('2026-10-04T23:00:00Z') },
    sevenDay: { usedPercent: 90, resetsAt: Date.parse('2026-10-09T04:00:00Z') },
    updatedAt: NOW - 60_000,
    stale: false,
  });
});

it('marks old readings stale, and keeps showing the last good one while the plugin backs off', () => {
  expect(parseHudCache(file(reading, {}, NOW - STALE_MS - 1), NOW)?.stale).toBe(true);
  const failing = { apiUnavailable: true, apiError: 'rate-limited', planName: 'Max' };
  const held = parseHudCache(
    JSON.stringify({ data: failing, timestamp: NOW, lastGoodData: reading }),
    NOW,
  );
  expect(held?.sevenDay?.usedPercent).toBe(90);
  expect(held?.stale).toBe(true); // shown, but marked
  expect(parseHudCache(JSON.stringify({ data: failing, timestamp: NOW }), NOW)).toBeNull(); // nothing good to show
});

it('says nothing about a window whose reset has passed, and never clamps an overage', () => {
  const over = { ...reading, fiveHourResetAt: '2026-10-04T19:00:00Z', sevenDay: 104 };
  const limits = parseHudCache(file(over), NOW);
  expect(limits?.fiveHour).toBeNull();
  expect(limits?.sevenDay?.usedPercent).toBe(104);
  expect(parseHudCache(file({ ...over, sevenDayResetAt: '2026-10-04T19:00:00Z' }), NOW)).toBeNull();
});

it('refuses anything that is not a plausible reading', () => {
  for (const bad of [
    '',
    'not json',
    '[]',
    JSON.stringify({ data: reading }), // no timestamp
    JSON.stringify({ data: reading, timestamp: NOW + 3_600_000 }), // from the future
    file({ ...reading, fiveHour: -1, sevenDay: 'lots' }),
    file({ ...reading, fiveHour: null, sevenDay: null }),
  ])
    expect(parseHudCache(bad, NOW)).toBeNull();
  expect(parseHudCache(file({ ...reading, planName: '  ' }), NOW)?.plan).toBeNull();
});

it('reads the file when it exists and reports nothing when it does not or is huge', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-limits-'));
  const path = join(dir, 'cache.json');
  await writeFile(path, file(reading, {}, Date.now() - 1000));
  const limits = await readClaudeLimits(path, Date.now());
  expect(limits?.plan).toBe('Max');
  expect(JSON.stringify(limits)).not.toContain('accessToken');
  expect(await readClaudeLimits(join(dir, 'missing.json'))).toBeNull();
  await writeFile(path, 'x'.repeat(70 * 1024));
  expect(await readClaudeLimits(path)).toBeNull();
});
