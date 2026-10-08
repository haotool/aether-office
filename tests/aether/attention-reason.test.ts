import { expect, it } from 'vitest';
import { attentionOf, attentionReason } from '../../apps/web/src/session-attention.js';
import type { LocalSession } from '../../packages/contracts/src/index.js';

const HOUR = 3_600_000;
const s = (
  state: LocalSession['liveness']['state'],
  quietMs: number | null,
  zombies: { program: string | null }[] = [],
  key = 'claude:x',
) =>
  ({
    key,
    liveness: {
      state,
      quietMs,
      startedAt: 1,
      zombies: zombies.map((z, i) => ({ pid: i, startedAt: 1, ...z })),
    },
  }) as unknown as LocalSession;

it('says in a few words why a session wants a person, and nothing for one that does not', () => {
  expect(attentionReason(s('dormant', 27 * HOUR))).toBe('休眠 27 小時');
  expect(attentionReason(s('orphaned', 5 * 60_000), 'en')).toMatch(/^orphaned /);
  expect(
    attentionReason(s('active', 0, [{ program: 'node' }, { program: 'node' }, { program: null }])),
  ).toBe(
    '殭屍 ×3 (node)', // the program names that are known, once each, never arguments
  );
  expect(attentionReason(s('dormant', 30 * HOUR, [{ program: 'sh' }]))).toBe(
    '休眠 30 小時 · 殭屍 ×1 (sh)',
  );
  expect(attentionReason(s('active', 0))).toBeNull();
  expect(attentionReason(s('idle', 2 * HOUR))).toBeNull(); // quiet is not forgotten
});

it('names the members by id', () => {
  expect(
    attentionOf([s('dormant', HOUR, [], 'claude:a'), s('active', 0, [], 'claude:b')], 'zh-TW'),
  ).toEqual({
    'local:claude:a': '休眠 1 小時',
  });
});
