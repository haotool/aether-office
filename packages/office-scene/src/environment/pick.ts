import type { Rng } from './seeded.js';

/** One of `items`, evenly. `items` must not be empty. */
export function pick<T>(r: Rng, items: readonly T[]): T {
  const item = items[Math.floor(r() * items.length)];
  if (item === undefined) throw new RangeError('pick needs a non-empty list of defined items');
  return item;
}

/** One key of `weights`, in proportion to its weight (a weight of 0 is never picked). */
export function weighted<K extends string>(r: Rng, weights: Readonly<Record<K, number>>): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  let x = r() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) if ((x -= w) < 0) return key;
  const first = entries[0];
  if (!first) throw new RangeError('weighted needs at least one positive weight');
  return first[0];
}

/** A number in [lo, hi). */
export const between = (r: Rng, lo: number, hi: number): number => lo + r() * (hi - lo);
