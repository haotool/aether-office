// What drives the squad beam: a rate with a stated unit, and the curve that turns it into a brightness. Pure.
import type { SquadMemberInput, SquadZoneState } from './squad-model.js';

/** Where the beam's rate comes from: the subagents' transcript token counts, or (when there are none) the tool calls. */
export type BeamSource = 'tokens' | 'tools';
export type BeamRate = { source: BeamSource; perMinute: number };

/** The beam's fallback rate is the tool starts in this window (the zone keeps them for as long). */
export const RATE_WINDOW_MS = 60_000;

/**
 * The squad's tokens per minute: the sum over its members that are still working and have a token sample (Claude's
 * transcript files; `perMinute` is measured between scans and is 0 until two samples exist). Null when no member has one,
 * which is "not known", never "zero".
 */
export function squadTokenRate(members: readonly SquadMemberInput[]): number | null {
  const sampled = members.filter((m) => m.status !== 'finished' && m.tokensPerMinute != null);
  return sampled.length ? sampled.reduce((sum, m) => sum + m.tokensPerMinute!, 0) : null;
}

/**
 * The rate the beam shows: tokens per minute when the squad has a measured, non-zero token rate, else the tool starts of the
 * last minute. A token rate of 0 falls back too (it is also what "no second sample yet" looks like), so the beam is never
 * dark just because the measurement has not started.
 */
export function beamRate(zone: SquadZoneState | undefined, now: number): BeamRate {
  if (zone?.tokensPerMinute) return { source: 'tokens', perMinute: zone.tokensPerMinute };
  return {
    source: 'tools',
    perMinute: zone ? zone.events.filter((at) => now - at < RATE_WINDOW_MS).length : 0,
  };
}

/**
 * The curve's reference rate per source, calibrated on real transcripts (docs/design/office-life.md section 4.4, pinned by
 * tests/aether/beam-calibration.test.ts): a squad's median working minute reads about 0.7 and the busiest 1% about 0.94 on
 * tool calls. Tokens are heavy-tailed but the curve is logarithmic, so the token reference sits far above any real rate: it only
 * places the median (0.7), and the busiest 1% reads about 0.84.
 */
export const BEAM_REFERENCE: Readonly<Record<BeamSource, number>> = {
  tokens: 8_000_000,
  tools: 24,
};
/** How sharply brightness approaches full: `tanh(SHARP * x)` is 0.905 at x = 1. */
const SHARP = 1.5;

/**
 * 0 to 1: how bright the beam burns for a rate. A log scale first (so 1 tool call and a dozen, 1k tokens and 12k, all
 * read), then a smooth saturation, `tanh(1.5 * ln(1 + rate) / ln(1 + reference))`: 0 for no work, about 0.9 at the
 * reference rate (see BEAM_REFERENCE), approaching 1 and never clipping, so a runaway rate does not make a flat white beam.
 * Monotonic, with no kink.
 */
export function beamIntensity({ source, perMinute }: BeamRate): number {
  const x = Math.log1p(Math.max(0, perMinute)) / Math.log1p(BEAM_REFERENCE[source]);
  return Math.tanh(SHARP * x);
}
