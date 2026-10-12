import { clamp01, draw, envelope, lerp, SPOT } from './shared.js';
import type { Effect, Rgb, Sprite } from './types.js';

const AMBER: Rgb = [1, 0.75, 0.25];
const GREEN: Rgb = [0.4, 0.95, 0.55];
const PAD = [0.6, 0.72, 0.1] as const;
const COUNTDOWN_MS = 2400;

export const launchPad: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 400);
  const p = clamp01((t - COUNTDOWN_MS) / (d - COUNTDOWN_MS));
  const drift = (draw(seed, 0) - 0.5) * 0.5;
  const lift = p * p * 3.2 + p * 0.4;
  const sprites: Sprite[] = [
    {
      cell: 'rocket',
      at: [PAD[0] + drift * p, PAD[1] + 0.1 + lift, PAD[2]],
      size: 0.32,
      alpha: fade,
    },
  ];
  for (let i = 0; i < 3; i += 1) {
    const lit = t >= i * 800;
    sprites.push({
      cell: 'glow',
      at: [PAD[0] - 0.14 + i * 0.14, PAD[1] + 0.02, PAD[2] + 0.18],
      size: 0.18,
      alpha: fade * (lit ? 1 : 0.25),
      tint: t >= COUNTDOWN_MS ? GREEN : AMBER,
    });
  }
  for (let i = 1; i <= 3; i += 1) {
    const q = clamp01(p - i * 0.05);
    if (q > 0)
      sprites.push({
        cell: 'spark',
        at: [PAD[0] + drift * q, PAD[1] + 0.1 + q * q * 3.2 + q * 0.4, PAD[2]],
        size: 0.05,
        alpha: fade * (1 - i * 0.25),
        tint: [1, 0.75, 0.35],
      });
  }
  return sprites;
};

export const fridayDeploy: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 400);
  const [x, y, z] = SPOT.overHead;
  const sprites: Sprite[] = [
    {
      cell: 'calendar',
      at: [x, y + Math.sin(t / 500) * 0.015, z],
      size: 0.34,
      alpha: fade,
      rot: Math.sin(t / 700) * 0.06,
    },
  ];
  for (let i = 0; i < 3; i += 1) {
    const q = (t / 1100 + i / 3 + draw(seed, i) * 0.1) % 1;
    sprites.push({
      cell: 'spark',
      at: [x + (i - 1) * 0.2, y - 0.1 - q * 0.3, z],
      size: 0.06,
      alpha: fade * (1 - q) * 0.9,
      tint: [0.5, 0.75, 1],
    });
  }
  return sprites;
};

export const lgtm: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 200);
  const thump = clamp01(t / 260);
  const at = [0, 1.15, -0.18] as const;
  const shock = clamp01((t - 250) / 650);
  return [
    {
      cell: 'stamp',
      at,
      size: lerp(0.66, 0.4, thump),
      alpha: fade,
      rot: (draw(seed, 0) - 0.5) * 0.18,
    },
    {
      cell: 'ring',
      at,
      size: 0.3 + 0.5 * shock,
      alpha: fade * (t < 250 ? 0 : 1 - shock) * 0.7,
      tint: [0.35, 0.9, 0.5],
    },
  ];
};
