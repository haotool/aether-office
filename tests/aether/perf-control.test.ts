import { expect, it } from 'vitest';
import {
  AMBIENT_FRAME_MS_PHONE,
  PIXEL_RATIO_CAP_PHONE_HIGH,
  PIXEL_RATIO_FLOOR,
  animationInterval,
  antialiasFor,
  earthTextureSize,
  pixelRatioCap,
  frameTargetMs,
  nextDrawAt,
  shadowDue,
  startRatio,
  stepRatio,
  type RatioState,
} from '../../packages/office-scene/src/perf/perf-control.js';

it('redraws the shadow map the first time and then only once its interval has passed', () => {
  expect(shadowDue(100, null, 50)).toBe(true);
  expect(shadowDue(140, 100, 50)).toBe(false);
  expect(shadowDue(150, 100, 50)).toBe(true);
});

/** Frames a second a screen of `hz` gets drawn under a cap of `fps`, with a few ms of jitter on every frame. */
function drawnPerSecond(hz: number, fps: number) {
  let due = -Infinity;
  let drawn = 0;
  for (let k = 0; k < hz * 4; k++) {
    const next = nextDrawAt((k * 1000) / hz + Math.sin(k * 12.9898) * 2, due, fps);
    if (next === null) continue;
    due = next;
    drawn++;
  }
  return drawn / 4;
}

it('holds the average frame rate to the cap on any refresh rate and never starves a screen at it', () => {
  for (const [hz, fps] of [
    [60, 60],
    [60, 30],
    [120, 60],
    [120, 30],
    [144, 60],
    [144, 30],
  ] as const) {
    expect(drawnPerSecond(hz, fps)).toBeGreaterThanOrEqual(fps * 0.97);
    expect(drawnPerSecond(hz, fps)).toBeLessThanOrEqual(fps * 1.03);
  }
});

it('waits for the next slot, forgives a frame a few ms early and does not catch up after a pause', () => {
  const step = 1000 / 30;
  expect(nextDrawAt(100, -Infinity, 30)).not.toBeNull();
  expect(nextDrawAt(110, 133, 30)).toBeNull();
  expect(nextDrawAt(130, 133, 30)).toBeCloseTo(133 + step, 5);
  expect(nextDrawAt(5000, 133, 30)).toBeGreaterThan(5000 + step / 2);
});

it('updates a character less often the farther it is from the camera', () => {
  expect(animationInterval(5)).toBe(0);
  const steps = [30, 60, 120].map(animationInterval);
  expect(steps).toEqual([1 / 30, 1 / 15, 1 / 5]);
  expect(steps[0]).toBeLessThan(steps[1]!);
  expect(steps[1]).toBeLessThan(steps[2]!);
});

function run(state: RatioState, frames: number, ms: number, at: { now: number }, ceiling = 2) {
  let s = state;
  for (let i = 0; i < frames; i++) {
    at.now += Math.max(ms, 16);
    s = stepRatio(s, ms, at.now, 1000 / 60, ceiling);
  }
  return s;
}

it('steps the pixel ratio down while frames are slow, never below the floor', () => {
  const at = { now: 10_000 };
  let s = startRatio(2, at.now);
  s = run(s, 30, 40, at);
  expect(s.ratio).toBe(1.75);
  s = run(s, 600, 40, at);
  expect(s.ratio).toBe(PIXEL_RATIO_FLOOR);
});

it('does not move on a healthy scene, and waits out its cooldown between steps', () => {
  const at = { now: 10_000 };
  const calm = run(startRatio(1.5, at.now), 200, 16, at, 1.5);
  expect(calm.ratio).toBe(1.5);
  const first = run(startRatio(2, at.now), 30, 40, at);
  const sooner = stepRatio(
    { ...first, samples: Array(29).fill(40) },
    40,
    first.changedAt + 100,
    1000 / 60,
    2,
  );
  expect(sooner.ratio).toBe(first.ratio);
});

it('steps back up after a long calm stretch, and waits longer when that step had to be undone', () => {
  const at = { now: 10_000 };
  let s = run(startRatio(2, at.now), 30, 40, at);
  at.now += 5000;
  s = run(s, 200, 16, at);
  expect(s.ratio).toBe(2);
  expect(s.lastStep).toBe('up');
  s = run(s, 30, 40, at);
  expect(s.ratio).toBe(1.75);
  expect(s.upCooldown).toBeGreaterThan(startRatio(2, 0).upCooldown);
});

it('never rises above the ceiling the quality tier allows', () => {
  const at = { now: 10_000 };
  const s = run(startRatio(1, at.now), 500, 8, at, 1);
  expect(s.ratio).toBe(1);
});

it('gives a phone and the low tier the small planet texture, and every other tier the full one', () => {
  expect(earthTextureSize(true)).toEqual({ width: 1024, height: 512 });
  expect(earthTextureSize(false)).toEqual({ width: 2048, height: 1024 });
});

it('holds a phone to its own ambient pace, so an idle phone is not read as slow', () => {
  const at = { now: 10_000 };
  const target = frameTargetMs(false, true);
  expect(target).toBeGreaterThan(AMBIENT_FRAME_MS_PHONE);
  let s = startRatio(1.5, at.now);
  for (let i = 0; i < 300; i++) {
    at.now += AMBIENT_FRAME_MS_PHONE + 4;
    s = stepRatio(s, AMBIENT_FRAME_MS_PHONE + 4, at.now, target, 1.5);
  }
  expect(s.ratio).toBe(1.5);
  expect(frameTargetMs(true, true)).toBe(1000 / 60);
  expect(frameTargetMs(false, false)).toBe(1000 / 30);
});

it('caps the pixel ratio by tier: the phone high tier is above its balanced tier, nothing else moved', () => {
  expect(pixelRatioCap('high', true)).toBe(PIXEL_RATIO_CAP_PHONE_HIGH);
  expect(pixelRatioCap('high', true)).toBe(2);
  expect(pixelRatioCap('high', true)).toBeGreaterThan(pixelRatioCap('balanced', true));
  expect(pixelRatioCap('balanced', true)).toBe(1.5);
  expect([pixelRatioCap('high', false), pixelRatioCap('balanced', false)]).toEqual([2, 1.5]);
  expect([pixelRatioCap('low', true), pixelRatioCap('low', false)]).toEqual([1, 1]);
  expect(pixelRatioCap('high', true)).toBeGreaterThan(PIXEL_RATIO_FLOOR);
});

it('keeps MSAA to the tiers unless ?msaa says otherwise, so a phone can be measured with and without it', () => {
  expect(antialiasFor('', false, 'balanced')).toBe(true);
  expect(antialiasFor('', true, 'high')).toBe(false);
  expect(antialiasFor('', false, 'low')).toBe(false);
  expect(antialiasFor('?msaa=1', true, 'balanced')).toBe(true);
  expect(antialiasFor('?perf=240&msaa=0', false, 'high')).toBe(false);
  expect(antialiasFor('?msaa=yes', true, 'high')).toBe(false);
});
