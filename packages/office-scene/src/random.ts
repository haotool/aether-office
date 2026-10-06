/** A stable unsigned 32-bit number from a text (FNV-1a over its UTF-16 units): the same text always gives the same number. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The generator type `seeded` returns. */
export type Rng = () => number;

/** A small deterministic generator: the same seed always gives the same sequence in [0, 1). */
export function seeded(seed: string): Rng {
  let h = hashText(seed);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One of `items`, evenly. */
export const pick = <T>(r: Rng, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

/** A number in [lo, hi). */
export const between = (r: Rng, lo: number, hi: number): number => lo + r() * (hi - lo);

/** One key of `weights`, in proportion to its weight (a weight of 0 is never picked). */
export function weighted<K extends string>(r: Rng, weights: Readonly<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  let x = r() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) if (w > 0 && (x -= w) < 0) return key;
  return entries.find(([, w]) => w > 0)![0];
}
