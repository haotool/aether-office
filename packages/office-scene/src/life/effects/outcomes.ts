import { clamp01, draw, envelope, lerp, SPOT } from './shared.js';
import type { Effect, Rgb, Sprite } from './types.js';
import { itemAt } from '../../environment/checked.js';

const GREEN: Rgb = [0.35, 0.9, 0.5];
const RED: Rgb = [1, 0.3, 0.3];
const AMBER: Rgb = [1, 0.72, 0.2];
const SQUASH_AT = [0.5, 0.66, 0.12] as const;
const LAMP = [SPOT.aboveScreen[0], 1.36, SPOT.aboveScreen[2]] as const;

const lamp = (t: number, fade: number, tint: Rgb): Sprite => ({
  cell: 'glow',
  at: LAMP,
  size: 0.5,
  alpha: fade * (0.7 + 0.3 * Math.sin(t / 500)),
  tint,
});

export const ciPass: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 400);
  const dir = draw(seed, 0) < 0.5 ? 1 : -1;
  const squash = 1000;
  const sprites: Sprite[] = [
    lamp(t, fade, GREEN),
    {
      cell: 'tick',
      at: LAMP,
      size: 0.2,
      alpha: fade * clamp01((t - 300) / 300),
      tint: GREEN,
    },
  ];
  if (t < squash)
    sprites.push({
      cell: 'bug',
      at: [lerp(dir > 0 ? 1 : 0.15, SQUASH_AT[0], t / squash), SQUASH_AT[1], SQUASH_AT[2]],
      size: 0.22,
      alpha: fade,
      rot: dir > 0 ? Math.PI : 0,
    });
  else {
    const p = clamp01((t - squash) / 500);
    sprites.push(
      {
        cell: 'bug',
        at: [SQUASH_AT[0], SQUASH_AT[1] - 0.01, SQUASH_AT[2]],
        size: 0.22,
        alpha: fade * (1 - 0.6 * clamp01((t - squash) / (d - squash))),
        rot: dir * 0.4,
        flat: true,
      },
      {
        cell: 'spark',
        at: [0, 0.7, 0.2],
        size: lerp(0.1, 0.34, p),
        alpha: fade * (1 - p),
        tint: GREEN,
      },
    );
  }
  return sprites;
};

export const ciFail: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 400);
  const dir = draw(seed, 0) < 0.5 ? 1 : -1;
  const run = clamp01(t / (d * 0.85));
  return [
    lamp(t, fade, RED),
    { cell: 'cross', at: LAMP, size: 0.18, alpha: fade * clamp01((t - 300) / 300), tint: RED },
    {
      cell: 'beetle',
      at:
        dir > 0
          ? [0.45 + 0.85 * run, 0.66 - 0.3 * clamp01(run * 2 - 1), 0.1 + Math.sin(t / 120) * 0.03]
          : [0.5 + Math.sin(t / 120) * 0.03, 0.66 - 0.3 * clamp01(run * 2 - 1), 0.1 + 0.8 * run],
      size: 0.22,
      alpha: fade,
      rot: dir > 0 ? 0 : -Math.PI / 2,
      tint: [1, 0.4, 0.38],
    },
  ];
};

export const ciStack: Effect = (t, d, _seed, value) => {
  const fade = envelope(t, d, 400);
  const lens: readonly [number, Rgb][] = [
    [1.5, RED],
    [1.34, AMBER],
    [1.18, GREEN],
  ];
  const lit = value > 0 ? 2 : 0;
  const sprites: Sprite[] = lens.map(([y]) => ({
    cell: 'ring',
    at: [0.62, y, -0.3],
    size: 0.15,
    alpha: fade * 0.8,
    tint: [0.6, 0.62, 0.7],
  }));
  const [y, tint] = itemAt(lens, lit);
  sprites.push({
    cell: 'glow',
    at: [0.62, y, -0.3],
    size: 0.36,
    alpha: fade * clamp01((t - 500) / 400) * (0.75 + 0.25 * Math.sin(t / 450)),
    tint,
  });
  return sprites;
};

export const buildError: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 350);
  const sway = Math.sin(t / 260 + draw(seed, 0) * 6) * 0.015;
  return [
    { cell: 'squiggle', at: [0.02 + sway, 0.93, -0.18], size: 0.62, alpha: fade, rot: sway * 2 },
    {
      cell: 'cross',
      at: [0.37, 0.93, -0.18],
      size: 0.09,
      alpha: fade * clamp01((t - 250) / 250),
      tint: RED,
    },
  ];
};

export const worksMachine: Effect = (t, d, seed) => {
  const fade = envelope(t, d, 250);
  const slap = clamp01(t / 260);
  const tilt = (draw(seed, 0) - 0.5) * 0.3;
  return [
    {
      cell: 'sticker',
      at: [-0.5, 1.1, -0.2],
      size: lerp(0.7, 0.42, slap),
      alpha: fade,
      rot: tilt,
    },
    {
      cell: 'spark',
      at: [-0.5, 1.1, -0.19],
      size: 0.1 + 0.3 * clamp01((t - 240) / 400),
      alpha: fade * (t < 240 ? 0 : 1 - clamp01((t - 240) / 400)),
    },
  ];
};

export const notABug: Effect = (t, d) => {
  const fade = envelope(t, d, 300);
  const flip = clamp01((t - 1400) / 400);
  const at = [0.55, 1.15, -0.2] as const;
  return [
    { cell: 'bugsign', at, size: 0.32, alpha: fade * (1 - flip), rot: -0.1 + flip * 0.5 },
    {
      cell: 'featuresign',
      at,
      size: 0.34,
      alpha: fade * flip,
      rot: -0.1 + (1 - flip) * -0.5 + Math.sin(t / 300) * 0.02 * flip,
    },
  ];
};
