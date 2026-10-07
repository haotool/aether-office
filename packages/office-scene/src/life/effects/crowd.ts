import { draw, envelope } from './shared.js';
import type { Effect, Rgb, Sprite } from './types.js';

/**
 * A pile of boxes beside the desk for a session with many uncommitted files: one box more each time the count doubles,
 * at most six, stacked two wide and three high. `value` is the count of uncommitted files.
 */
export const techDebt: Effect = (t, d, seed, value) => {
  const fade = envelope(t, d, 900);
  const boxes = Math.min(6, Math.max(1, Math.round(Math.log2(Math.max(2, value)))));
  return Array.from({ length: boxes }, (_, i): Sprite => ({
    cell: 'box',
    at: [
      1.15 + (i % 2) * 0.27 + (draw(seed, i) - 0.5) * 0.06,
      0.12 + Math.floor(i / 2) * 0.23,
      0.25 + (draw(seed, i + 4) - 0.5) * 0.1,
    ],
    size: 0.27,
    alpha: fade,
    rot: (draw(seed, i + 8) - 0.5) * 0.2,
  }));
};

/**
 * A holographic circle on the floor where several idle members stand: a slow ring with a dot for each place. Laid out
 * round the group's centre (the layer anchors it there); nobody walks, it is only a picture.
 */
export const standUp: Effect = (t, d) => {
  const fade = envelope(t, d, 900);
  const sprites: Sprite[] = [
    { cell: 'ring', at: [0, 0.1, 0], size: 3.2, alpha: fade * 0.8, rot: t / 6000, flat: true },
  ];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + t / 5000;
    sprites.push({
      cell: 'spark',
      at: [Math.cos(a) * 1.5, 0.11, Math.sin(a) * 1.5],
      size: 0.14,
      alpha: fade * 0.9,
      tint: [0.55, 0.85, 1],
      flat: true,
    });
  }
  return sprites;
};

const CONFETTI: readonly Rgb[] = [
  [1, 0.4, 0.5],
  [1, 0.8, 0.3],
  [0.4, 0.85, 0.6],
  [0.45, 0.65, 1],
  [0.8, 0.55, 1],
];

/** How many pieces of confetti fall over a desk. */
const CONFETTI_PER_DESK = 5;

/** Confetti over a desk (the Konami code): a few pieces fall, spinning, each with its own start, colour and sway. */
export const konami: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 500);
  return Array.from({ length: CONFETTI_PER_DESK }, (_, i): Sprite => {
    const start = draw(seed, i) * 900;
    const p = Math.min(1, Math.max(0, (t - start) / 2800));
    const sway = (draw(seed, i + 3) - 0.5) * 1.2;
    return {
      cell: 'confetti',
      at: [sway + Math.sin(p * 9 + i) * 0.12, 2.5 - p * 1.9, (draw(seed, i + 6) - 0.5) * 0.9],
      size: 0.17,
      alpha: fade * (t < start ? 0 : 1),
      rot: p * 12 + i,
      tint: CONFETTI[Math.floor(draw(seed, i + 9) * CONFETTI.length)]!,
    };
  });
};
