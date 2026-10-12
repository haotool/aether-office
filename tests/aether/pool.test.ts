import { expect, it } from 'vitest';
import { mapPool } from '../../apps/control/src/services/runtime/pool.js';

it('keeps input order, never exceeds the width, and lets a slow item not stall the rest', async () => {
  let running = 0;
  let peak = 0;
  const finished: number[] = [];
  let release!: () => void;
  const others = new Promise<void>((resolve) => (release = resolve));
  const out = await mapPool([0, 1, 2, 3, 4, 5], 2, async (_, i) => {
    running++;
    peak = Math.max(peak, running);
    await (i === 0 ? others : Promise.resolve());
    running--;
    finished.push(i);
    if (finished.length === 5) release();
    return i * 10;
  });
  expect(out).toEqual([0, 10, 20, 30, 40, 50]);
  expect(peak).toBe(2);
  expect(finished.indexOf(0)).toBe(5);
});

it('handles nothing, and a width larger than the work', async () => {
  expect(await mapPool([], 4, async () => 1)).toEqual([]);
  expect(await mapPool([1, 2], 99, async (n) => n + 1)).toEqual([2, 3]);
});
