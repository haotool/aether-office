import type { Seat, Shot } from './director.js';
import { FLOOR_HEIGHT } from './building.js';

export type V3 = [number, number, number];
export type Pose = { position: V3; target: V3; fov: number };

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep: no jolt at either end
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const floorBase = (floor: number) => floor * FLOOR_HEIGHT;

/** A desk's own frame to the world: the desk is turned a quarter turn per step of `rotation`. */
export function toWorld(seat: Seat, local: V3, baseY = floorBase(seat.floor)): V3 {
  const r = (seat.rotation * Math.PI) / 2;
  return [
    seat.x + local[0] * Math.cos(r) + local[2] * Math.sin(r),
    baseY + local[1],
    seat.z - local[0] * Math.sin(r) + local[2] * Math.cos(r),
  ];
}

// A member sits at the +z side of the desk facing -z, its screen in front of it. Cameras are placed in that frame.
const WATCH: V3 = [0, 1.05, 0.75];
const CLOSEUP: Record<0 | 1 | 2, { from: V3; to: V3 }> = {
  0: { from: [-1.9, 2.1, 4.1], to: [-1.0, 1.5, 2.4] }, // over the shoulder, pushing in
  1: { from: [3.6, 1.7, 1.9], to: [2.3, 1.5, 0.9] }, // from the side, sliding in
  2: { from: [-3.3, 1.0, 2.2], to: [-1.5, 2.5, 3.1] }, // a low start rising to look down at the screen
};

/**
 * Where the camera is, and what it looks at, `t` (0 to 1) of the way through a shot. Smoothly moving the whole time:
 * a shot is a move, not a still.
 */
export function poseAt(
  shot: Shot,
  seats: ReadonlyMap<string, Seat>,
  t: number,
  aspect: number,
): Pose {
  const e = smoother(Math.min(1, Math.max(0, t)));
  // A portrait screen needs more distance for the same subject width.
  const back = Math.min(1.9, Math.max(1, 1.1 / aspect));
  const first = shot.subjects[0] ? seats.get(shot.subjects[0]) : undefined;

  if (shot.kind === 'closeup' && first) {
    const path = CLOSEUP[shot.style];
    const from: V3 = [path.from[0] * back, path.from[1] * (0.9 + back * 0.1), path.from[2] * back];
    const to: V3 = [path.to[0] * back, path.to[1] * (0.9 + back * 0.1), path.to[2] * back];
    return {
      position: toWorld(first, mix(from, to, e)),
      target: toWorld(first, WATCH),
      fov: lerp(36, 30, e),
    };
  }

  const second = shot.subjects[1] ? seats.get(shot.subjects[1]) : undefined;
  if (shot.kind === 'pair' && first && second) {
    const a = toWorld(first, WATCH);
    const b = toWorld(second, WATCH);
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const span = Math.hypot(dx, dz) || 1;
    // The camera stands to one side of the line between them, far enough to hold both, and slides along it.
    const side = shot.style === 1 ? -1 : 1;
    const distance = Math.max(4.6, span * 0.85 + 3.2) * back;
    const slide = (e - 0.5) * span * 0.35;
    return {
      position: [
        mid[0] + (-dz / span) * distance * side + (dx / span) * slide,
        mid[1] + 1.1 + span * 0.14,
        mid[2] + (dx / span) * distance * side + (dz / span) * slide,
      ],
      target: [mid[0], mid[1] + 0.1, mid[2]],
      fov: lerp(38, 34, e),
    };
  }

  // A sweep: the floor from a height, turning slowly.
  const turn = (lerp(-0.45, 0.45, e) + shot.style * 1.1) % (Math.PI * 2);
  const radius = 34 * back;
  return {
    position: [
      Math.sin(turn) * radius,
      floorBase(shot.floor) + 24 + shot.style * 3,
      Math.cos(turn) * radius,
    ],
    target: [0, floorBase(shot.floor) + 0.5, 0],
    fov: 38,
  };
}
