import type { Quality } from '../scene/scene-types.js';
import { itemAt } from '../environment/checked.js';
/**
 * Ceilings, not promises: `AdaptiveRatio` lowers them while frames run slow (never under `PIXEL_RATIO_FLOOR`) and the
 * screen's own ratio caps them. The phone's `high` is 2 behind the adaptive floor and has NOT been validated on a phone
 * (heat, sustained fill rate).
 */
export const PIXEL_RATIO_CAP_PHONE_HIGH = 2;
const PIXEL_RATIO_CAP_PHONE_BALANCED = 1.5;
const PIXEL_RATIO_CAP_DESKTOP_HIGH = 2;
const PIXEL_RATIO_CAP_DESKTOP_BALANCED = 1.5;
const PIXEL_RATIO_CAP_LOW = 1;

export const pixelRatioCap = (quality: Quality, compact: boolean): number =>
  quality === 'high'
    ? compact
      ? PIXEL_RATIO_CAP_PHONE_HIGH
      : PIXEL_RATIO_CAP_DESKTOP_HIGH
    : quality === 'balanced'
      ? compact
        ? PIXEL_RATIO_CAP_PHONE_BALANCED
        : PIXEL_RATIO_CAP_DESKTOP_BALANCED
      : PIXEL_RATIO_CAP_LOW;

/**
 * Whether the canvas is created with MSAA. The tiers decide (not on a phone, not on low); `?msaa=1` or `?msaa=0`
 * overrides them for a measurement. The context is made once, so the page has to be loaded again to change it.
 */
export function antialiasFor(search: string, compact: boolean, quality: Quality): boolean {
  const asked = new URLSearchParams(search).get('msaa');
  if (asked === '1') return true;
  if (asked === '0') return false;
  return !compact && quality !== 'low';
}

/** The planet's texture size: a phone (or the low tier) shows a corner of it, so it takes a quarter of the memory. */
export const earthTextureSize = (small: boolean) =>
  small ? { width: 1024, height: 512 } : { width: 2048, height: 1024 };

export const AMBIENT_FRAME_MS = 24;
/** On a phone the ambient scene settles at about 20 frames a second: the battery, not the eye, is the limit. */
export const AMBIENT_FRAME_MS_PHONE = 50;

export const SHADOW_INTERVAL_MS = { high: 50, balanced: 83, low: 0 } as const;

export const shadowDue = (nowMs: number, lastMs: number | null, intervalMs: number) =>
  lastMs === null || nowMs - lastMs >= intervalMs;

export function animationInterval(distance: number): number {
  if (distance < 22) return 0;
  if (distance < 45) return 1 / 30;
  if (distance < 90) return 1 / 15;
  return 1 / 5;
}

export const PIXEL_RATIO_FLOOR = 0.75;
const STEP = 0.25;
const WINDOW = 30;
const SLOW = 1.4;
const FAST = 1.05;
const DOWN_COOLDOWN_MS = 1000;
const UP_COOLDOWN_MS = 4000;
const UP_AFTER_FRAMES = 90;

export type RatioState = {
  ratio: number;
  samples: readonly number[];
  calm: number;
  changedAt: number;
  upCooldown: number;
  lastStep: 'up' | 'down' | null;
};

export const startRatio = (ratio: number, nowMs: number): RatioState => ({
  ratio,
  samples: [],
  calm: 0,
  changedAt: nowMs,
  upCooldown: UP_COOLDOWN_MS,
  lastStep: null,
});

const median = (values: readonly number[]) =>
  itemAt(
    [...values].sort((a, b) => a - b),
    Math.floor(values.length / 2),
  );

/**
 * Hysteresis: separate thresholds, a cooldown after each step, and a longer wait before stepping up again when the last
 * step up had to be undone, so it settles instead of flapping.
 */
export function stepRatio(
  state: RatioState,
  frameMs: number,
  nowMs: number,
  target: number,
  ceiling: number,
): RatioState {
  const samples = [...state.samples, frameMs].slice(-WINDOW);
  const next = { ...state, samples };
  if (samples.length < WINDOW) return next;
  const typical = median(samples);
  const since = nowMs - state.changedAt;
  const floor = Math.min(ceiling, PIXEL_RATIO_FLOOR);
  if (typical > target * SLOW && state.ratio > floor && since >= DOWN_COOLDOWN_MS)
    return {
      ...next,
      ratio: Math.max(floor, state.ratio - STEP),
      samples: [],
      calm: 0,
      changedAt: nowMs,
      lastStep: 'down',
      upCooldown:
        state.lastStep === 'up' && since < 2 * UP_COOLDOWN_MS
          ? Math.min(state.upCooldown * 2, 60_000)
          : state.upCooldown,
    };
  const calm = typical < target * FAST ? state.calm + 1 : 0;
  if (calm >= UP_AFTER_FRAMES && state.ratio < ceiling && since >= state.upCooldown)
    return {
      ...next,
      ratio: Math.min(ceiling, state.ratio + STEP),
      samples: [],
      calm: 0,
      changedAt: nowMs,
      lastStep: 'up',
    };
  return { ...next, calm };
}

/**
 * The frame time a mode is expected to hold on a 60 Hz screen. The ambient scene is redrawn on a timer (24 ms; 50 ms on
 * a phone, see `AnimationClock`), so frames arrive that far apart however fast they render: the phone's target is that
 * pace plus one 60 Hz frame. Against 30 Hz every phone frame counted as slow and the ratio fell to its floor within
 * seconds.
 */
export const frameTargetMs = (smooth: boolean, compact: boolean) =>
  smooth ? 1000 / 60 : compact ? AMBIENT_FRAME_MS_PHONE + 1000 / 60 : 1000 / 30;
