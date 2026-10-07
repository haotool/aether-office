import { draw, envelope, SPOT } from './shared.js';
import type { Effect, Sprite } from './types.js';

const AMBER = [1, 0.72, 0.2] as const;
const VIOLET = [0.7, 0.55, 1] as const;

/**
 * A lamp over the screen blinks amber while a test command runs, and a bug scurries across the desk. Amber means only
 * "a test command started": there is no green or red here, because no exit status reaches the scene yet.
 */
export const ciLamp: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 400);
  const blink = 0.55 + 0.45 * Math.sin(t / 160); // about 1 Hz, well under the 3 flashes a second a viewer can bear
  const lap = (t / 3200) % 1;
  const dir = draw(seed, 0) < 0.5 ? 1 : -1;
  const sprites: Sprite[] = [
    {
      cell: 'glow',
      at: [SPOT.aboveScreen[0], 1.36, SPOT.aboveScreen[2]],
      size: 0.5,
      alpha: fade * blink,
      tint: AMBER,
    },
    {
      cell: 'spark',
      at: [SPOT.aboveScreen[0], 1.36, SPOT.aboveScreen[2]],
      size: 0.16,
      alpha: fade * (0.6 + 0.4 * blink),
      tint: [1, 0.9, 0.6],
    },
  ];
  sprites.push({
    cell: 'bug',
    at: [(lap * 1.3 - 0.65) * dir, 0.65, 0.2],
    size: 0.17,
    alpha: fade,
    rot: dir > 0 ? 0 : Math.PI,
  });
  return sprites;
};

/** A swirling disc on the desk pulling sparks in (a package install): it grows while the effect lasts. */
export const installHole: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 700);
  const grow = 0.75 + 0.25 * Math.min(1, t / 8000);
  const [x, y, z] = [0.4, 0.615, 0.08] as const;
  const sprites: Sprite[] = [
    { cell: 'hole', at: [x, y, z], size: 0.6 * grow, alpha: fade, rot: -t / 700, flat: true },
  ];
  for (let i = 0; i < 6; i += 1) {
    const p = (t / 1800 + i / 6 + draw(seed, i) * 0.1) % 1; // 0 far, 1 swallowed
    const angle = p * 5 + (i * Math.PI * 2) / 6;
    const r = 0.34 * (1 - p);
    sprites.push({
      cell: 'spark',
      at: [x + Math.cos(angle) * r, y + 0.03, z + Math.sin(angle) * r],
      size: 0.035,
      alpha: fade * Math.min(1, p * 3) * (1 - p),
      tint: VIOLET,
    });
  }
  return sprites;
};
