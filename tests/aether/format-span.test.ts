import { expect, it } from 'vitest';
import {
  apparitionsOf,
  needsAttention,
  zombiesOf,
} from '../../apps/web/src/lib/sessions/session-attention.js';
import { formatSpan } from '../../packages/kernel/src/index.js';

it('writes a span the way a person reads it, rounded down and never zero', () => {
  expect(formatSpan(10_000)).toBe('1 分鐘');
  expect(formatSpan(5 * 60_000)).toBe('5 分鐘');
  expect(formatSpan(59 * 60_000 + 59_000)).toBe('59 分鐘');
  expect(formatSpan(14 * 3600_000 + 40 * 60_000)).toBe('14 小時');
  expect(formatSpan(47 * 3600_000)).toBe('47 小時');
  expect(formatSpan(3 * 86400_000, 'en')).toBe('3 d');
  expect(formatSpan(90 * 60_000, 'en')).toBe('1 h');
});

it('calls forgotten, ownerless and uncollected sessions worth attention, and no others', () => {
  const at = (state: 'active' | 'idle' | 'dormant' | 'orphaned' | 'ended' | 'unknown') =>
    needsAttention({ liveness: { state, startedAt: null, quietMs: null, zombies: [] } });
  expect(['dormant', 'orphaned'].every((s) => at(s as 'dormant'))).toBe(true);
  expect(
    needsAttention({
      liveness: {
        state: 'active',
        startedAt: null,
        quietMs: null,
        zombies: [{ pid: 1, startedAt: 0, program: null }],
      },
    }),
  ).toBe(true);
  expect(['active', 'idle', 'ended', 'unknown'].some((s) => at(s as 'active'))).toBe(false);
});

it('names the member that stands for each session drawn as a figure, and which have zombies behind them', () => {
  const s = (key: string, state: 'active' | 'dormant' | 'orphaned', zombies = 0) =>
    ({
      key,
      liveness: {
        state,
        startedAt: null,
        quietMs: null,
        zombies: Array.from({ length: zombies }, (_, pid) => ({
          pid,
          startedAt: 0,
          program: null,
        })),
      },
    }) as never;
  const sessions = [
    s('claude:a', 'active'),
    s('claude:b', 'dormant'),
    s('codex:c', 'orphaned'),
    s('claude:d', 'active', 2),
  ];
  expect(apparitionsOf(sessions)).toEqual({
    'local:claude:b': 'sleeping_rabbit',
    'local:codex:c': 'ghost',
  });
  expect(zombiesOf(sessions)).toEqual({ 'local:claude:d': 2 }); // the member stays; a jiangshi stands behind it
});
