import { clamp01, draw, envelope, SPOT } from './shared.js';
import type { Effect, Rgb, Sprite } from './types.js';

const AMBER: Rgb = [1, 0.7, 0.15];

export const forcePush: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 500);
  const spin = draw(seed, 0) < 0.5 ? 1 : -1;
  const sprites: Sprite[] = [
    {
      cell: 'hazard',
      at: [0, 0.12, 0.1],
      size: 2.1,
      alpha: fade * 0.9,
      rot: (spin * t) / 5000,
      flat: true,
    },
  ];
  for (let i = 0; i < 2; i += 1) {
    const a = (spin * t) / 1600 + i * Math.PI;
    sprites.push(
      {
        cell: 'glow',
        at: [Math.cos(a) * 0.85, 1.1, 0.1 + Math.sin(a) * 0.85],
        size: 0.3,
        alpha: fade,
        tint: AMBER,
      },
      {
        cell: 'spark',
        at: [Math.cos(a - 0.35) * 0.85, 1.1, 0.1 + Math.sin(a - 0.35) * 0.85],
        size: 0.12,
        alpha: fade * 0.6,
        tint: AMBER,
      },
    );
  }
  return sprites;
};

export const mergeConflict: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 700);
  const first = draw(seed, 0) < 0.5 ? 1 : -1;
  const ramp = 0.4 + 0.6 * clamp01(t / 2500);
  const pull = first * Math.sin(t / 650) * 0.16 * ramp;
  const y = 0.84;
  const sprites: Sprite[] = [
    {
      cell: 'chevrons',
      at: [0.16 + pull * 0.4, y, 0.15],
      size: 0.3,
      alpha: fade,
      rot: pull * 0.5,
    },
    {
      cell: 'chevrons',
      at: [0.9 + pull * 0.4, y, 0.15],
      size: 0.3,
      alpha: fade,
      rot: Math.PI + pull * 0.5,
    },
  ];
  for (let i = 0; i < 5; i += 1) {
    const k = i / 4;
    sprites.push({
      cell: 'spark',
      at: [0.3 + k * 0.52 + pull * 0.4, y - Math.sin(k * Math.PI) * 0.05, 0.15],
      size: 0.07,
      alpha: fade * 0.85,
      tint: [1, 0.85, 0.5],
    });
  }
  sprites.push({
    cell: 'glow',
    at: [0.56 + pull, y, 0.15],
    size: 0.28,
    alpha: fade * 0.9,
    tint: [1, 0.55, 0.65],
  });
  return sprites;
};

export const skullGag: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 350);
  const [x, y, z] = SPOT.overHead;
  const side = (draw(seed, 0) - 0.5) * 0.3;
  return [
    {
      cell: 'skull',
      at: [x + side, y + 0.05 * clamp01(t / 800) + Math.sin(t / 380) * 0.012, z],
      size: 0.34,
      alpha: fade,
      rot: Math.sin(t / 260) * 0.12 * Math.exp(-t / 1800),
    },
    {
      cell: 'ring',
      at: [x + side, y, z],
      size: 0.3 + 0.4 * clamp01(t / 900),
      alpha: fade * (1 - clamp01(t / 900)) * 0.5,
      tint: [0.9, 0.9, 0.95],
    },
  ];
};

export const sudoPrompt: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 350);
  const x = draw(seed, 0) < 0.5 ? -0.55 : 0.55;
  const at = [x, 1.12 + Math.sin(t / 600) * 0.012, -0.22] as const;
  const p = clamp01((t - 300) / 800);
  return [
    { cell: 'root', at, size: 0.4, alpha: fade, rot: x < 0 ? 0.08 : -0.08 },
    { cell: 'ring', at, size: 0.4 + 0.3 * p, alpha: fade * (1 - p) * 0.5, tint: [0.5, 1, 0.65] },
  ];
};

export const curlPipe: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 350);
  const x = draw(seed, 0) < 0.5 ? 0.55 : -0.55;
  const at = [x, 1.12 + Math.sin(t / 650) * 0.012, -0.22] as const;
  const pulse = (start: number) => clamp01((t - start) / 700);
  const sprites: Sprite[] = [
    { cell: 'pipe', at, size: 0.42, alpha: fade, rot: x < 0 ? 0.08 : -0.08 },
  ];
  for (const start of [300, 1100]) {
    const p = pulse(start);
    if (p > 0 && p < 1)
      sprites.push({
        cell: 'ring',
        at,
        size: 0.3 + 0.35 * p,
        alpha: fade * (1 - p) * 0.55,
        tint: AMBER,
      });
  }
  return sprites;
};
