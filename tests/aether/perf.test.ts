import { expect, it } from 'vitest';
import { summarizeFrames } from '../../packages/office-scene/src/perf.js';

it('summarises measured frame times without inventing numbers', () => {
  expect(summarizeFrames([])).toBeNull();
  const stats = summarizeFrames([16, 17, 16, 18, 16, 50, 16, 17, 16, 16])!;
  expect(stats).toMatchObject({ frames: 10, medianMs: 16, maxMs: 50, medianFps: 62.5 });
  expect(stats.p95Ms).toBe(50);
});
