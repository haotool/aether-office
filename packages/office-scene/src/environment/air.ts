// Pure rules for the office's air: how many motes by quality, and the light's colour by the hour.

export type AirQuality = 'low' | 'balanced' | 'high';

/** Dust motes and window light shafts drawn at each quality (none on low and on a phone). */
export const AIR = {
  low: { motes: 0, shafts: 0 },
  balanced: { motes: 110, shafts: 3 },
  high: { motes: 240, shafts: 5 },
} as const satisfies Record<AirQuality, { motes: number; shafts: number }>;

const NIGHT = [0.45, 0.68, 1.0] as const; // a cool blue
const DAY = [1.0, 0.86, 0.62] as const; // a warm gold
type Rgb = readonly [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * How day-like the light is at `hour` (0 to 24, local): 0 at night, 1 around midday, easing through dawn (5 to 8) and
 * dusk (17 to 20).
 */
export function daylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const ramp = (t: number) => Math.min(1, Math.max(0, t));
  const dawn = ramp((h - 5) / 3);
  const dusk = ramp((20 - h) / 3);
  const t = Math.min(dawn, dusk);
  return t * t * (3 - 2 * t);
}

/** The tint of the motes and shafts: cool blue at night, warm gold in the day, as linear RGB 0 to 1. */
export const tintAt = (hour: number): [number, number, number] => mix(NIGHT, DAY, daylight(hour));

/** The fractional local hour of a date. */
export const hourOf = (date: Date) => date.getHours() + date.getMinutes() / 60;
