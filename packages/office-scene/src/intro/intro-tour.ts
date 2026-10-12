import { crownTop } from '../core/crown-layout.js';
import { EXPLODED_GAP, FLOOR_HEIGHT } from '../environment/building.js';
import { FLOORS } from '../environment/layout.js';
import type { Pose, V3 } from '../core/shot-camera.js';

export type IntroPhase = 'orbit' | 'toExploded' | 'rise' | 'hold' | 'toStacked';

type IntroSegment = {
  phase: IntroPhase;
  from: number;
  to: number;
  exploded: boolean;
  dip: boolean;
};

const DIP_S = 0.4;
const ORBIT_S = 26;
const RISE_S = 15;
const HOLD_S = 4;

const FULL: readonly IntroSegment[] = [
  { phase: 'orbit', from: 0, to: ORBIT_S, exploded: false, dip: false },
  { phase: 'toExploded', from: ORBIT_S, to: ORBIT_S + DIP_S, exploded: true, dip: true },
  {
    phase: 'rise',
    from: ORBIT_S + DIP_S,
    to: ORBIT_S + DIP_S + RISE_S,
    exploded: true,
    dip: false,
  },
  {
    phase: 'hold',
    from: ORBIT_S + DIP_S + RISE_S,
    to: ORBIT_S + DIP_S + RISE_S + HOLD_S,
    exploded: true,
    dip: false,
  },
  {
    phase: 'toStacked',
    from: ORBIT_S + DIP_S + RISE_S + HOLD_S,
    to: ORBIT_S + 2 * DIP_S + RISE_S + HOLD_S,
    exploded: false,
    dip: true,
  },
];

const STILL_S = 3;
const REDUCED: readonly IntroSegment[] = [
  { phase: 'orbit', from: 0, to: STILL_S, exploded: false, dip: false },
  { phase: 'toExploded', from: STILL_S, to: STILL_S + DIP_S, exploded: true, dip: true },
  { phase: 'rise', from: STILL_S + DIP_S, to: 2 * STILL_S + DIP_S, exploded: true, dip: false },
  { phase: 'hold', from: 2 * STILL_S + DIP_S, to: 3 * STILL_S + DIP_S, exploded: true, dip: true },
  {
    phase: 'toStacked',
    from: 3 * STILL_S + DIP_S,
    to: 3 * STILL_S + 2 * DIP_S,
    exploded: false,
    dip: true,
  },
];

export const INTRO_TIMELINE = { full: FULL, reduced: REDUCED } as const;
export const introSegments = (reduced: boolean) => (reduced ? REDUCED : FULL);
export const introLength = (reduced: boolean) => introSegments(reduced).at(-1)?.to ?? 0;

export function introSegmentAt(t: number, reduced: boolean): IntroSegment | null {
  return introSegments(reduced).find((s) => t >= s.from && t < s.to) ?? null;
}

export type IntroFrame = {
  aspect: number;
  tiers: number;
  reduced: boolean;
  home: Pose;
};

const FOV = 38;
export const START_BEARING = Math.atan2(30, 44);
const ORBIT_RADIUS = 84;
const ORBIT_HEIGHT = 38;
const ORBIT_TARGET_Y = 30;
const RISE_RADIUS = 100;
const RISE_HEIGHT = 10;
const RISE_TARGET_Y = 9;
const RISE_DRIFT = (30 * Math.PI) / 180;
const HOLD_PUSH = 3;
const HOLD_MIN_RADIUS = 72;
const HALF_FOV_TAN = Math.tan((19 * Math.PI) / 180);
const RAMP_S = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export const farther = (aspect: number) => clamp(1.25 / aspect, 1, 2.4);

export function orbitShare(t: number): number {
  const cruise = ORBIT_S - 2 * RAMP_S;
  const peak = 1 / (RAMP_S + cruise);
  const ramp = (u: number) => (u - (RAMP_S / Math.PI) * Math.sin((Math.PI * u) / RAMP_S)) / 2;
  const s = clamp(t, 0, ORBIT_S);
  if (s <= RAMP_S) return peak * ramp(s);
  if (s <= RAMP_S + cruise) return peak * (RAMP_S / 2 + (s - RAMP_S));
  const u = s - RAMP_S - cruise;
  return (
    peak * (RAMP_S / 2 + cruise + (u + (RAMP_S / Math.PI) * Math.sin((Math.PI * u) / RAMP_S)) / 2)
  );
}

export function crownHeights(tiers: number) {
  const roof = FLOORS * FLOOR_HEIGHT + (FLOORS - 1) * EXPLODED_GAP;
  const bloom = tiers > 0 ? crownTop(roof, tiers) + 6 : roof + 4;
  return { roof, bloom, middle: (roof + 6 + bloom) / 2 };
}

const around = (radius: number, bearing: number, y: number): V3 => [
  radius * Math.sin(bearing),
  y,
  radius * Math.cos(bearing),
];
const along = (from: V3, to: V3, distance: number): V3 => {
  const d: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const n = Math.hypot(...d) || 1;
  return [
    from[0] + (d[0] / n) * distance,
    from[1] + (d[1] / n) * distance,
    from[2] + (d[2] / n) * distance,
  ];
};

const orbit = (t: number, b: number): Pose => ({
  position: around(ORBIT_RADIUS * b, START_BEARING + 2 * Math.PI * orbitShare(t), ORBIT_HEIGHT),
  target: [0, ORBIT_TARGET_Y, 0],
  fov: FOV,
});

function rise(u: number, b: number, tiers: number): Pose {
  const { roof, bloom, middle } = crownHeights(tiers);
  const hold = Math.max(HOLD_MIN_RADIUS, ((bloom - roof - 6 + 12) / 2 / HALF_FOV_TAN) * 1.1);
  const e = smoother(u);
  const targetY = lerp(RISE_TARGET_Y, middle, e);
  return {
    position: around(
      lerp(RISE_RADIUS, hold, e) * b,
      START_BEARING + RISE_DRIFT * e,
      targetY + RISE_HEIGHT + (bloom + 4 - middle) * e,
    ),
    target: [0, targetY, 0],
    fov: FOV,
  };
}

function hold(u: number, b: number, tiers: number): Pose {
  const end = rise(1, b, tiers);
  return { ...end, position: along(end.position, end.target, HOLD_PUSH * u) };
}

export function introPoseAt(t: number, frame: IntroFrame): Pose {
  const b = farther(frame.aspect);
  const segment = introSegmentAt(t, frame.reduced);
  if (!segment) return frame.home;
  const u = (t - segment.from) / (segment.to - segment.from);
  if (frame.reduced) {
    if (segment.phase === 'orbit') return orbit(0, b);
    if (segment.phase === 'toExploded' || segment.phase === 'rise') return rise(0, b, frame.tiers);
    return segment.phase === 'hold' ? hold(0, b, frame.tiers) : frame.home;
  }
  switch (segment.phase) {
    case 'orbit':
      return orbit(t, b);
    case 'toExploded':
      return rise(0, b, frame.tiers);
    case 'rise':
      return rise(u, b, frame.tiers);
    case 'hold':
      return hold(u, b, frame.tiers);
    case 'toStacked':
      return frame.home;
  }
}
