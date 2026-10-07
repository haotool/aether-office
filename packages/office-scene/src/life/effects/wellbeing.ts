import { clamp01, draw, envelope, lerp, SPOT } from './shared.js';
import type { Effect, Sprite } from './types.js';

/**
 * A rubber duck on the right of the desk (the side the usual camera sees) while the model thinks it through: it bobs, and a
 * thought dot drifts up now and then. The seed picks where along that side it sits.
 */
export const rubberDuck: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 600);
  const x = 0.38 + draw(seed, 0) * 0.3;
  const z = 0.02 + draw(seed, 1) * 0.2;
  const y = SPOT.deskRight[1];
  const bob = Math.sin(t / 520) * 0.012;
  const sprites: Sprite[] = [
    {
      cell: 'duck',
      at: [x, y + 0.1 + bob, z],
      size: 0.28 * (0.6 + 0.4 * fade),
      alpha: fade,
      rot: Math.sin(t / 900) * 0.08,
    },
  ];
  const phase = (t / 2400) % 1;
  sprites.push({
    cell: 'spark',
    at: [x + 0.08, y + 0.28 + phase * 0.3, z],
    size: 0.06 + 0.04 * phase,
    alpha: fade * (1 - phase) * 0.8,
  });
  return sprites;
};

/** Steam over the mug (the coffee refill): three puffs rise, widen and fade, one after another. */
export const coffeeRefill: Effect = (t, d) => {
  const fade = envelope(t, d, 500);
  const [x, y, z] = SPOT.mug;
  return [0, 1, 2].map((i) => {
    const p = clamp01(((t - i * 700) % 2100) / 2100);
    return {
      cell: 'steam',
      at: [x + Math.sin(p * 6 + i) * 0.03, y + 0.05 + p * 0.38, z],
      size: lerp(0.14, 0.34, p),
      alpha: fade * Math.sin(p * Math.PI),
    };
  });
};
