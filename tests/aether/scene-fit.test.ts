import { expect, it } from 'vitest';
import { fittedOffset } from '../../packages/office-scene/src/scene/scene-geometry.js';

const OVERVIEW: [number, number, number] = [30, 34, 44];
const length = (v: number[]) => Math.hypot(...v);
const slope = (v: number[]) => v[1]! / Math.hypot(v[0]!, v[2]!); // how steeply it looks down

it('leaves a landscape view as designed and pulls a portrait view back and up', () => {
  expect(fittedOffset(OVERVIEW, 1.6)).toEqual(OVERVIEW);
  const portrait = fittedOffset(OVERVIEW, 0.7);
  expect(length(portrait)).toBeGreaterThan(length(OVERVIEW) * 1.4);
  expect(slope(portrait)).toBeGreaterThan(slope(OVERVIEW));
});

it('stays within a bounded distance on a very narrow screen and never moves the camera nearer', () => {
  expect(length(fittedOffset(OVERVIEW, 0.2))).toBeLessThan(length(OVERVIEW) * 2.9);
  for (const aspect of [0.3, 0.6, 1, 2, 3])
    expect(length(fittedOffset(OVERVIEW, aspect))).toBeGreaterThanOrEqual(length(OVERVIEW) * 0.99);
});
