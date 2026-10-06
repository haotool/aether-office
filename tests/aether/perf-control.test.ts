import { expect, it } from 'vitest';
import {
  PIXEL_RATIO_FLOOR,
  animationInterval,
  shadowDue,
  startRatio,
  stepRatio,
  type RatioState,
} from '../../packages/office-scene/src/perf-control.js';

it('redraws the shadow map the first time and then only once its interval has passed', () => {
  expect(shadowDue(100, null, 50)).toBe(true);
  expect(shadowDue(140, 100, 50)).toBe(false);
  expect(shadowDue(150, 100, 50)).toBe(true);
});

it('updates a character less often the farther it is from the camera', () => {
  expect(animationInterval(5)).toBe(0);
  const steps = [30, 60, 120].map(animationInterval);
  expect(steps).toEqual([1 / 30, 1 / 15, 1 / 5]);
  expect(steps[0]).toBeLessThan(steps[1]!);
  expect(steps[1]).toBeLessThan(steps[2]!);
});

/** Feeds `frames` frames of `ms` each, 16 ms of wall clock apart plus the frame time, and returns the final state. */
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
  expect(sooner.ratio).toBe(first.ratio); // 100 ms after a step is inside the cooldown
});

it('steps back up after a long calm stretch, and waits longer when that step had to be undone', () => {
  const at = { now: 10_000 };
  let s = run(startRatio(2, at.now), 30, 40, at); // down to 1.75
  at.now += 5000;
  s = run(s, 200, 16, at);
  expect(s.ratio).toBe(2);
  expect(s.lastStep).toBe('up');
  s = run(s, 30, 40, at); // slow again right after: undone
  expect(s.ratio).toBe(1.75);
  expect(s.upCooldown).toBeGreaterThan(startRatio(2, 0).upCooldown);
});

it('never rises above the ceiling the quality tier allows', () => {
  const at = { now: 10_000 };
  const s = run(startRatio(1, at.now), 500, 8, at, 1);
  expect(s.ratio).toBe(1);
});
