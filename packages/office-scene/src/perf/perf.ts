import { itemAt } from '../environment/checked.js';
// Frame-time statistics from real measurements. Never estimates: callers pass measured deltas.
export type FrameStats = {
  frames: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  medianFps: number;
};

const percentile = (sorted: readonly number[], p: number) =>
  itemAt(sorted, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));

export function summarizeFrames(deltasMs: readonly number[]): FrameStats | null {
  if (deltasMs.length === 0) return null;
  const sorted = [...deltasMs].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  return {
    frames: sorted.length,
    medianMs: round(median),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(sorted.at(-1) ?? median),
    medianFps: round(1000 / median),
  };
}
const round = (n: number) => Math.round(n * 100) / 100;

export type PerfReport = {
  stats: FrameStats;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  gpuMegabytes: number;
  jsMs: { median: number; p95: number };
  renderMs: { median: number; p95: number };
  renderer: string;
  quality: string;
  devicePixelRatio: number;
  viewport: { width: number; height: number };
  measuredAt: string;
};
