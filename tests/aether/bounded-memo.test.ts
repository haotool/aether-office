import { expect, it } from 'vitest';
import { memoized } from '../../packages/office-scene/src/memo.js';
import { driftParams } from '../../packages/office-scene/src/behavior.js';
import { pendingChains, serialized } from '../../apps/web/src/features/terminal-driver.js';

it('memoized keeps at most `limit` entries, dropping the oldest, and recomputes a dropped one', () => {
  const cache = new Map<string, number>();
  let made = 0;
  const get = memoized(cache, 3, (k: string) => (made++, k.length));
  for (const k of ['a', 'bb', 'ccc', 'dddd']) get(k);
  expect(cache.size).toBe(3);
  expect(cache.has('a')).toBe(false);
  get('bb');
  expect(made).toBe(4);
  get('a');
  expect(made).toBe(5);
});

it('driftParams stays deterministic across eviction', () => {
  const first = driftParams('member-0');
  for (let i = 1; i < 2000; i++) driftParams(`member-${i}`);
  expect(driftParams('member-0')).toEqual(first);
});

it('serialized forgets a terminal once its queue has drained', async () => {
  await serialized('t-1', async () => 1);
  await Promise.resolve();
  expect(pendingChains()).toBe(0);
});
