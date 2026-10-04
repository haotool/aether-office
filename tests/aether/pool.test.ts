import { expect, it } from 'vitest';
import { mapPool } from '../../apps/control/src/services/pool.js';

it('keeps input order, never exceeds the width, and lets a slow item not stall the rest', async () => {
  let running = 0;
  let peak = 0;
  const finished: number[] = [];
  const out = await mapPool([30, 1, 1, 1, 1, 1], 2, async (ms, i) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, ms));
    running--;
    finished.push(i);
    return i * 10;
  });
  expect(out).toEqual([0, 10, 20, 30, 40, 50]);
  expect(peak).toBe(2);
  expect(finished.indexOf(0)).toBe(5); // the slow first item finished last; the others went on without it
});

it('handles nothing, and a width larger than the work', async () => {
  expect(await mapPool([], 4, async () => 1)).toEqual([]);
  expect(await mapPool([1, 2], 99, async (n) => n + 1)).toEqual([2, 3]);
});
