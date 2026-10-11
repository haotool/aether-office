import type { SquadMemberInput, SquadZoneState } from './squad-model.js';

type BeamSource = 'tokens' | 'tools';
export type BeamRate = { source: BeamSource; perMinute: number };

export const RATE_WINDOW_MS = 60_000;

export function squadTokenRate(members: readonly SquadMemberInput[]): number | null {
  const rates = members.flatMap((m) =>
    m.status !== 'finished' && m.tokensPerMinute != null ? [m.tokensPerMinute] : [],
  );
  return rates.length ? rates.reduce((sum, rate) => sum + rate, 0) : null;
}

/**
 * The rate the beam shows: tokens per minute when the squad has a measured, non-zero token rate, else the tool starts
 * of the last minute. A token rate of 0 falls back too, because it is also what "no second sample yet" looks like.
 */
export function beamRate(zone: SquadZoneState | undefined, now: number): BeamRate {
  if (zone?.tokensPerMinute) return { source: 'tokens', perMinute: zone.tokensPerMinute };
  return {
    source: 'tools',
    perMinute: zone ? zone.events.filter((at) => now - at < RATE_WINDOW_MS).length : 0,
  };
}

/**
 * Reference rate per source, calibrated on real transcripts (docs/design/office-life.md section 4.4, pinned by
 * tests/aether/beam-calibration.test.ts).
 */
export const BEAM_REFERENCE: Readonly<Record<BeamSource, number>> = {
  tokens: 8_000_000,
  tools: 24,
};
const SHARP = 1.5;

/**
 * 0 to 1, a log scale then a smooth saturation `tanh(1.5 * ln(1 + rate) / ln(1 + reference))`: 0 for no work, about 0.9
 * at the reference rate (BEAM_REFERENCE), never clipping, so a runaway rate does not make a flat white beam.
 */
export function beamIntensity({ source, perMinute }: BeamRate): number {
  const x = Math.log1p(Math.max(0, perMinute)) / Math.log1p(BEAM_REFERENCE[source]);
  return Math.tanh(SHARP * x);
}
