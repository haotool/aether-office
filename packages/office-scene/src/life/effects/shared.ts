import { seeded } from '../../random.js';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Rises over `edge` ms, holds, falls over `edge` ms before `duration`; 0 outside the effect. */
export const envelope = (t: number, duration: number, edge = 350) =>
  t < 0 || t > duration ? 0 : clamp01(Math.min(t / edge, (duration - t) / edge));

/** The `n`th draw of the stream a seed names: a variant picks the same way every time. */
export const draw = (seed: number, n: number) => seeded(`${seed}:${n}`)();

/** Spots on and over a desk, in its own frame: over the monitor, the desk top, the mug's corner and over the sitter's head. */
export const SPOT = {
  aboveScreen: [0, 1.55, -0.3],
  deskRight: [0.5, 0.66, 0.1],
  mug: [0.66, 0.7, 0.12],
  overHead: [0, 1.72, 0.86],
} as const;
