import { hashText } from './hash.js';

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
