import { seeded } from '../../environment/seeded.js';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const envelope = (t: number, duration: number, edge = 350) =>
  t < 0 || t > duration ? 0 : clamp01(Math.min(t / edge, (duration - t) / edge));

export const draw = (seed: number, n: number) => seeded(`${seed}:${n}`)();

export const SPOT = {
  aboveScreen: [0, 1.55, -0.3],
  deskRight: [0.5, 0.66, 0.1],
  mug: [0.66, 0.7, 0.12],
  overHead: [0, 1.72, 0.86],
} as const;
