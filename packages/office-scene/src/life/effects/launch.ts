import { clamp01, draw, envelope, lerp, SPOT } from './shared.js';
import type { Effect, Sprite } from './types.js';

/** "Ship it": a rocket (or, now and then, a paper plane) lifts off the desk and climbs, leaving a few sparks. */
export const shipIt: Effect = (t, d, seed) => {
  const p = clamp01(t / d);
  const plane = draw(seed, 0) < 0.35;
  const drift = (draw(seed, 1) - 0.5) * 0.8;
  const climb = p * p * 3.2 + p * 0.5;
  const at = [drift * p, 0.75 + climb, 0.1] as const;
  const sprites: Sprite[] = [
    {
      cell: plane ? 'plane' : 'rocket',
      at,
      size: plane ? 0.22 : 0.26,
      alpha: envelope(t, d, 300),
      rot: plane ? -0.5 : 0,
    },
  ];
  for (let i = 1; i <= 4; i += 1) {
    const q = clamp01(p - i * 0.045);
    sprites.push({
      cell: 'spark',
      at: [drift * q, 0.75 + q * q * 3.2 + q * 0.5, 0.1],
      size: 0.05 * (1 - i * 0.15),
      alpha: envelope(t, d, 300) * (1 - i * 0.2) * 0.8,
      tint: [1, 0.75, 0.35],
    });
  }
  return sprites;
};

/** A pager bell over the head shakes and settles (the member hit an error): two rings spread from it. */
export const pager: Effect = (t, d) => {
  const fade = envelope(t, d, 250);
  const shake = Math.sin(t / 55) * 0.4 * Math.exp(-t / 900);
  const [x, y, z] = SPOT.overHead;
  const sprites: Sprite[] = [{ cell: 'bell', at: [x, y, z], size: 0.26, alpha: fade, rot: shake }];
  for (const delay of [0, 450]) {
    const p = clamp01((t - delay) / 900);
    if (p > 0 && p < 1)
      sprites.push({
        cell: 'ring',
        at: [x, y, z],
        size: lerp(0.2, 0.6, p),
        alpha: fade * (1 - p) * 0.7,
        tint: [1, 0.55, 0.35],
      });
  }
  return sprites;
};
