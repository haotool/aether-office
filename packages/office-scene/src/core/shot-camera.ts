import type { Seat, Shot } from '../environment/director.js';
import { floorY } from '../scene/scene-geometry.js';

export type V3 = [number, number, number];
export type Pose = { position: V3; target: V3; fov: number };

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => {
  const n = length(a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

export function toWorld(seat: Seat, local: V3, baseY = floorY(seat.floor, false)): V3 {
  const r = (seat.rotation * Math.PI) / 2;
  return [
    seat.x + local[0] * Math.cos(r) + local[2] * Math.sin(r),
    baseY + local[1],
    seat.z - local[0] * Math.sin(r) + local[2] * Math.cos(r),
  ];
}

const WATCH: V3 = [0, 1.05, 0.75];
const CLOSEUP: Record<0 | 1 | 2, V3> = {
  0: [-1.9, 2.1, 4.1],
  1: [3.6, 1.7, 1.9],
  2: [-3.3, 1.0, 2.2],
};
/**
 * A shot is one slow dolly along one axis, never an orbit: the camera does not turn while it moves, the horizon stays
 * level and the lens does not zoom, so nothing swims.
 */
export const MAX_TRAVEL = 4;
export const MIN_DISTANCE = 4;
const DOLLY = { closeup: 1.1, pair: 2, sweep: MAX_TRAVEL } as const;
const FOV = { closeup: 32, pair: 36, sweep: 38 } as const;
export const FLY_MAX = 6;
export const FLY_MS = 1400;

type Framing = { e: number; back: number; aspect: number; exploded: boolean };

function closeupPose(shot: Shot, subject: Seat, { e, back, exploded }: Framing): Pose {
  const base = floorY(subject.floor, exploded);
  const framed: V3 = [
    CLOSEUP[shot.style][0] * back,
    CLOSEUP[shot.style][1] * (0.9 + back * 0.1),
    CLOSEUP[shot.style][2] * back,
  ];
  const away = sub(framed, WATCH);
  const from = add(WATCH, unit(away), Math.max(length(away), MIN_DISTANCE + DOLLY.closeup));
  return {
    position: toWorld(subject, add(from, unit(sub(WATCH, from)), DOLLY.closeup * e), base),
    target: toWorld(subject, WATCH, base),
    fov: FOV.closeup,
  };
}

function pairPose(shot: Shot, first: Seat, second: Seat, { e, aspect, exploded }: Framing): Pose {
  // The same two members are always framed from the same side whoever wrote to whom, so a pair never flips on the
  // screen (the 180 degree rule); the camera trucks along the line between them in one direction.
  const [lo, hi] =
    (shot.subjects[0] ?? '') < (shot.subjects[1] ?? '') ? [first, second] : [second, first];
  const a = toWorld(lo, WATCH, floorY(lo.floor, exploded));
  const b = toWorld(hi, WATCH, floorY(hi.floor, exploded));
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const span = Math.hypot(dx, dz) || 1;
  const distance = Math.max(
    4.6,
    span * 0.85 + 3.2,
    (span / 2 + DOLLY.pair / 2 + 0.9) / (Math.tan((FOV.pair * Math.PI) / 360) * aspect),
  );
  const slide: V3 = [(dx / span) * (e - 0.5) * DOLLY.pair, 0, (dz / span) * (e - 0.5) * DOLLY.pair];
  const centre = add(mid, slide);
  return {
    position: [
      centre[0] + (-dz / span) * distance,
      mid[1] + 1.1 + span * 0.14,
      centre[2] + (dx / span) * distance,
    ],
    target: [centre[0], mid[1] + 0.1, centre[2]],
    fov: FOV.pair,
  };
}

function sweepPose(
  shot: Shot,
  seats: ReadonlyMap<string, Seat>,
  { e, back, exploded }: Framing,
): Pose {
  const bearing = shot.style * 1.1;
  const radius = 34 * back;
  const base = floorY(shot.floor, exploded);
  const from: V3 = [
    Math.sin(bearing) * radius,
    base + 24 + shot.style * 3,
    Math.cos(bearing) * radius,
  ];
  const occupied = shot.subjects.flatMap((id) => {
    const seat = seats.get(id);
    return seat ? [seat] : [];
  });
  const target: V3 = occupied.length
    ? [
        occupied.reduce((n, s) => n + s.x, 0) / occupied.length,
        base + WATCH[1],
        occupied.reduce((n, s) => n + s.z, 0) / occupied.length,
      ]
    : [0, base + 0.5, 0];
  from[0] += target[0];
  from[2] += target[2];
  return { position: add(from, unit(sub(target, from)), DOLLY.sweep * e), target, fov: FOV.sweep };
}

export function poseAt(
  shot: Shot,
  seats: ReadonlyMap<string, Seat>,
  t: number,
  aspect: number,
  exploded = false,
): Pose {
  const framing = {
    e: smoother(Math.min(1, Math.max(0, t))),
    back: Math.min(1.9, Math.max(1, 1.1 / aspect)),
    aspect: Math.max(0.1, aspect),
    exploded,
  };
  const first = shot.subjects[0] ? seats.get(shot.subjects[0]) : undefined;
  const second = shot.subjects[1] ? seats.get(shot.subjects[1]) : undefined;
  if (shot.kind === 'closeup' && first) return closeupPose(shot, first, framing);
  if (shot.kind === 'pair' && first && second) return pairPose(shot, first, second, framing);
  return sweepPose(shot, seats, framing);
}

/**
 * A glide when the shots are near (same floor, a few metres apart, not back the way the last shot was moving), a hard
 * cut otherwise: a cut hides a long flight across the building, which makes a viewer dizzy.
 */
export function chooseEntry(
  previous: Shot | null,
  next: Shot,
  seats: ReadonlyMap<string, Seat>,
  aspect: number,
): 'cut' | 'fly' {
  if (!previous || previous.floor !== next.floor) return 'cut';
  const began = poseAt(previous, seats, 0, aspect);
  const ended = poseAt(previous, seats, 1, aspect);
  const arrives = poseAt(next, seats, 0, aspect);
  const gap = sub(arrives.position, ended.position);
  const reverses =
    gap.reduce((s, v, i) => s + v * ((ended.position[i] ?? 0) - (began.position[i] ?? 0)), 0) < 0;
  const near = length(gap) <= FLY_MAX && length(sub(arrives.target, ended.target)) <= FLY_MAX;
  return near && !reverses ? 'fly' : 'cut';
}
