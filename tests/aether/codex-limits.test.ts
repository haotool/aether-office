import { expect, it } from 'vitest';
import { parseCodexLimits } from '../../apps/control/src/services/codex-limits.js';
import { buffer, codexCount } from './usage-fixtures.js';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const usage = { input: 10, output: 1 };

it('reads both windows of the latest reading, shortest first, with the plan and when it was written', () => {
  const tail = buffer(
    '{"cut line that',
    codexCount('2026-10-07T01:00:00.000Z', usage, usage, true),
    codexCount('2026-10-07T01:05:00.000Z', usage, usage), // no limits on this one: the earlier reading stands
  );
  expect(parseCodexLimits(tail, NOW)).toEqual({
    plan: 'pro',
    windows: [
      { minutes: 300, usedPercent: 41.5, resetsAt: 4_000_000_000_000 },
      { minutes: 10080, usedPercent: 12, resetsAt: 4_000_100_000_000 },
    ],
    updatedAt: Date.parse('2026-10-07T01:00:00.000Z'),
  });
});

it('says nothing about a window whose reset has passed, and nothing when there is no reading', () => {
  expect(
    parseCodexLimits(
      buffer(codexCount('2026-10-07T01:00:00.000Z', usage, usage, true)),
      4_000_050_000_000,
    )?.windows,
  ).toEqual([{ minutes: 10080, usedPercent: 12, resetsAt: 4_000_100_000_000 }]);
  expect(
    parseCodexLimits(
      buffer(codexCount('2026-10-07T01:00:00.000Z', usage, usage, true)),
      4_000_200_000_000,
    ),
  ).toBeNull();
  expect(parseCodexLimits(buffer('{}'), NOW)).toBeNull();
});
