export type ContextLevel = 'calm' | 'warm' | 'hot';
const CONTEXT_WARM = 60;
const CONTEXT_HOT = 85;

export function contextLevel(percent: number): ContextLevel {
  return percent > CONTEXT_HOT ? 'hot' : percent >= CONTEXT_WARM ? 'warm' : 'calm';
}

export const CONTEXT_COLOR: Record<ContextLevel, string> = {
  calm: '#43e6df',
  warm: '#ffc65c',
  hot: '#ff7a85',
};

export type SceneCompaction = { key: number; fromPct: number | null; toPct: number | null };

export const COMPACTION_SECONDS = 2.5;

export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export const tweenSeconds = (from: number, to: number) =>
  0.4 + Math.min(1, Math.abs(to - from) / 50);

export const COMPACTION_LIVE_MS = 3000;
