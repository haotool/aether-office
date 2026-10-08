/** How full a context window is, in steps: calm under 60%, warm from 60 to 85, hot above. The one rule every view uses. */
export type ContextLevel = 'calm' | 'warm' | 'hot';
const CONTEXT_WARM = 60;
const CONTEXT_HOT = 85;

export function contextLevel(percent: number): ContextLevel {
  return percent > CONTEXT_HOT ? 'hot' : percent >= CONTEXT_WARM ? 'warm' : 'calm';
}

/** The colors of the steps as the 3D scene draws them (the page's own views take the same steps from tokens). */
export const CONTEXT_COLOR: Record<ContextLevel, string> = {
  calm: '#43e6df',
  warm: '#ffc65c',
  hot: '#ff7a85',
};

/** A compaction the scene should play once: `key` identifies the detection, the shares are before and after. */
export type SceneCompaction = { key: number; fromPct: number | null; toPct: number | null };

/** Length of the compaction effect in seconds: the burst, the shockwave, the bar's tween and the chip all fit in it. */
export const COMPACTION_SECONDS = 2.5;

/** Ease-out cubic: fast at first, settling softly; `t` is clamped to 0..1. */
export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** Seconds a gauge takes to move between two shares: a small step is quick, a compaction's big fall is slow enough to follow. */
export const tweenSeconds = (from: number, to: number) =>
  0.4 + Math.min(1, Math.abs(to - from) / 50);

/** How long the page keeps a compaction in the scene's props: the effect (COMPACTION_SECONDS) and the chip's fade fit in it. */
export const COMPACTION_LIVE_MS = 3000;
