// Pure rules the scene's performance controllers follow; the components in PerfControllers.tsx feed them real timings.
import type { Quality } from './scene-types.js';
/**
 * The most the scene may render at (device pixels per CSS pixel), by tier. `AdaptiveRatio` lowers it while frames run slow
 * (never under `PIXEL_RATIO_FLOOR`) and the screen's own ratio caps it, so these are ceilings, not promises. One constant per
 * tier so each is a one-line revert. The phone's `high` was 1.5 (the same as its `balanced`) until a real device could be
 * tried: it is 2 now behind the adaptive floor, and has NOT been validated on a phone (heat, sustained fill rate).
 */
export const PIXEL_RATIO_CAP_PHONE_HIGH = 2;
export const PIXEL_RATIO_CAP_PHONE_BALANCED = 1.5;
export const PIXEL_RATIO_CAP_DESKTOP_HIGH = 2;
export const PIXEL_RATIO_CAP_DESKTOP_BALANCED = 1.5;
/** The low tier renders at the CSS pixel size on every device. */
export const PIXEL_RATIO_CAP_LOW = 1;

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
 * Whether the canvas is created with MSAA. The tiers decide (not on a phone, not on low); `?msaa=1` or `?msaa=0` overrides
 * them for a measurement, so the maintainer can A/B it on a real phone (the protocol is in docs/design-system.md).
 * The context is made once, so the page has to be loaded again to change it.
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

/** The pause between ambient redraws (drones, scan sweeps, shimmer); the camera invalidates on its own and keeps the full rate. */
export const AMBIENT_FRAME_MS = 24;
/** On a phone the ambient scene settles at about 20 frames a second: the battery, not the eye, is the limit. */
export const AMBIENT_FRAME_MS_PHONE = 50;

/** How often the shadow map is redrawn: its casters (people at their desks) move slowly, and it does not depend on the camera. */
export const SHADOW_INTERVAL_MS = { high: 50, balanced: 83, low: 0 } as const;

/** Whether the shadow map is due a redraw: first time, or at least `intervalMs` since the last one. */
export const shadowDue = (nowMs: number, lastMs: number | null, intervalMs: number) =>
  lastMs === null || nowMs - lastMs >= intervalMs;

/**
 * Seconds between animation updates of a character, by distance from the camera: close ones run every frame, far ones
 * (a few pixels tall) at 30, 15 and 5 Hz. The pose of a distant member does not need more.
 */
export function animationInterval(distance: number): number {
  if (distance < 22) return 0;
  if (distance < 45) return 1 / 30;
  if (distance < 90) return 1 / 15;
  return 1 / 5;
}

/** Rendering scale steps, relative to the device's own ratio, never below this. */
export const PIXEL_RATIO_FLOOR = 0.75;
const STEP = 0.25;
const WINDOW = 30; // frames in the rolling median
const SLOW = 1.4; // a median this far over the target is a slow scene
const FAST = 1.05; // and this close to the target is a scene with room to spare
const DOWN_COOLDOWN_MS = 1000;
const UP_COOLDOWN_MS = 4000;
const UP_AFTER_FRAMES = 90;

export type RatioState = {
  ratio: number;
  samples: readonly number[];
  /** Consecutive frames that fit the target with room to spare. */
  calm: number;
  changedAt: number;
  /** Milliseconds to wait before stepping up again: doubled when a step up had to be undone. */
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
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/**
 * Dynamic resolution: step the pixel ratio down while frames run well over the target time, and back up when they have
 * fit with room to spare for a while. Hysteresis: separate thresholds, a cooldown after each step, and a longer wait
 * before stepping up again when the last step up had to be undone, so it settles instead of flapping.
 * `ceiling` is the ratio the quality tier allows, `target` the frame time (ms) this mode is expected to hold.
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
 * The frame time a mode is expected to hold on a 60 Hz screen: a continuous camera move, or the ambient pace. The ambient
 * scene is redrawn on a timer (24 ms; 50 ms on a phone, see `AnimationClock`), so frames arrive that far apart however fast
 * they render: the phone's target is that pace plus one 60 Hz frame. Against 30 Hz (33 ms, slow from 47 ms) every phone frame
 * counted as slow and the ratio fell to its floor within seconds.
 */
export const frameTargetMs = (smooth: boolean, compact: boolean) =>
  smooth ? 1000 / 60 : compact ? AMBIENT_FRAME_MS_PHONE + 1000 / 60 : 1000 / 30;
