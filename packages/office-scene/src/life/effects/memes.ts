import { clamp01, envelope, lerp, SPOT } from './shared.js';
import type { Effect, Sprite } from './types.js';

export const retryLoop: Effect = (t, d) => {
  const fade = envelope(t, d, 500);
  const [x, y, z] = SPOT.overHead;
  return [
    { cell: 'loop', at: [x, y, z], size: 0.3 * (0.7 + 0.3 * fade), alpha: fade, rot: -t / 450 },
  ];
};

export const ctrlCv: Effect = (t, d) => {
  const fade = envelope(t, d, 250);
  const hop = (start: number, cell: 'keyc' | 'keyv', x: number): Sprite => {
    const p = clamp01((t - start) / 1000);
    return {
      cell,
      at: [lerp(0, x, p), lerp(1.05, 0.7, p) + Math.sin(p * Math.PI) * 0.18, lerp(-0.2, 0.18, p)],
      size: 0.17,
      alpha: fade * (t < start ? 0 : 1),
    };
  };
  return [hop(0, 'keyc', -0.14), hop(900, 'keyv', 0.14)];
};

export const vimTrap: Effect = (t, d) => {
  const fade = envelope(t, d, 400);
  return [
    {
      cell: 'vim',
      at: [0.72, 1.12 + Math.sin(t / 700) * 0.01, -0.22],
      size: 0.3,
      alpha: fade,
      rot: -0.12 + Math.sin(t / 900) * 0.03,
    },
  ];
};
