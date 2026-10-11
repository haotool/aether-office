import { clamp01, draw, envelope, SPOT } from './shared.js';
import type { Effect, Sprite } from './types.js';

export const timeMachine: Effect = (t, d) => {
  const fade = envelope(t, d, 350);
  const [x, y, z] = SPOT.aboveScreen;
  return [
    {
      cell: 'swirl',
      at: [x, y, z],
      size: 0.3 * (0.7 + 0.3 * fade),
      alpha: fade * 0.9,
      rot: t / 380,
      tint: [0.55, 0.75, 1],
    },
  ];
};

const NOTES = 3;
export const stickyNotes: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 300);
  const sprites: Sprite[] = [];
  for (let i = 0; i < NOTES; i += 1) {
    if (t < i * 450) continue;
    const pop = clamp01((t - i * 450) / 220);
    sprites.push({
      cell: 'sticky',
      at: [0.52 + (draw(seed, i) - 0.5) * 0.06, 1.38 - i * 0.17, -0.3],
      size: 0.15 * (0.6 + 0.4 * pop),
      alpha: fade * pop,
      rot: (draw(seed, i + 3) - 0.5) * 0.35,
    });
  }
  return sprites;
};
