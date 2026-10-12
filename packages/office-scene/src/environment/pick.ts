import type { Rng } from './seeded.js';

export function pick<T>(r: Rng, items: readonly T[]): T {
  const item = items[Math.floor(r() * items.length)];
  if (item === undefined) throw new RangeError('pick needs a non-empty list of defined items');
  return item;
}

export function weighted<K extends string>(r: Rng, weights: Readonly<Record<K, number>>): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  let x = r() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) if ((x -= w) < 0) return key;
  const first = entries[0];
  if (!first) throw new RangeError('weighted needs at least one positive weight');
  return first[0];
}

export const between = (r: Rng, lo: number, hi: number): number => lo + r() * (hi - lo);
