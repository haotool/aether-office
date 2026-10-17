import { buildNavGrid, findPath, type NavGrid, type Point } from '@aether/kernel';
import type { Layout } from '@aether/contracts';
import { positionAt } from '../environment/carriers.js';
import type { ClipName } from './animal-states.js';

export const SEAT_DEPTH = 0.86;
export const CORE_RADIUS = 1.5;
export const STAND_MS = 1250;
export const WAVE_MS = 2000;
export const WALK_SPEED = 1.2;
// How fast the walk clip's own stride moves the body at 1x: each foot swings 0.45 m back in the half second it is planted
// (measured on the model: 2 x 0.46 rad over a 0.49 m leg). Played at WALK_PACE the planted foot stays put on the floor.
export const WALK_STRIDE_SPEED = 0.9;
export const WALK_PACE = WALK_SPEED / WALK_STRIDE_SPEED;
export const SINK_MS = 450;
export const STAGGER_MS = 350;
const TURN_MS = 400;
const SEATED_HEADING = Math.PI;

export type Departure = {
  points: Point[];
  walkMetres: number;
  deskYaw: number;
};
export type DeparturePose = {
  clip: Extract<ClipName, 'stand_up' | 'idle' | 'walk'> | null;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  bag: boolean;
  gone: boolean;
};

export const pathLength = (points: readonly Point[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    if (from && to) total += Math.hypot(to.x - from.x, to.z - from.z);
  }
  return total;
};
const heading = (from: Point, to: Point, otherwise: number) =>
  from.x === to.x && from.z === to.z ? otherwise : Math.atan2(to.x - from.x, to.z - from.z);
const shortest = (a: number, b: number) =>
  ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

type Desk = Pick<Layout['objects'][number], 'x' | 'z' | 'rotation'>;

function planDeparture(grid: NavGrid, desk: Desk): Departure {
  const deskYaw = (desk.rotation * Math.PI) / 2;
  const seat = {
    x: desk.x + SEAT_DEPTH * Math.sin(deskYaw),
    z: desk.z + SEAT_DEPTH * Math.cos(deskYaw),
  };
  const found = findPath(grid, seat, { x: 0, z: 0 });
  const points = [seat, ...(found.status === 'ok' ? found.points : [{ x: 0, z: 0 }])];
  return { points, walkMetres: Math.max(0, pathLength(points) - CORE_RADIUS), deskYaw };
}

export function planDepartures(layout: Layout, ids: readonly string[]): Record<string, Departure> {
  const grids = new Map<number, NavGrid>();
  const out: Record<string, Departure> = {};
  for (const id of ids) {
    const desk = layout.objects.find((o) => o.agentId === id);
    if (!desk) continue;
    const floor = desk.floor ?? 0;
    let grid = grids.get(floor);
    if (!grid) {
      grid = buildNavGrid(layout.objects.filter((o) => (o.floor ?? 0) === floor));
      grids.set(floor, grid);
    }
    out[id] = planDeparture(grid, desk);
  }
  return out;
}

export function departureAt(
  plan: Departure,
  elapsedMs: number,
  reducedMotion = false,
): DeparturePose {
  const seat = plan.points[0] ?? { x: 0, z: 0 };
  const pose = (at: Point, facing: number, over: Partial<DeparturePose>): DeparturePose => {
    const dx = at.x - seat.x;
    const dz = at.z - seat.z;
    const cos = Math.cos(plan.deskYaw);
    const sin = Math.sin(plan.deskYaw);
    return {
      clip: null,
      x: dx * cos - dz * sin,
      z: dx * sin + dz * cos,
      yaw: facing - plan.deskYaw - SEATED_HEADING,
      scale: 1,
      bag: false,
      gone: false,
      ...over,
    };
  };
  if (reducedMotion && elapsedMs >= 0) return pose(seat, SEATED_HEADING, { gone: true });
  if (elapsedMs < 0) return pose(seat, SEATED_HEADING, {});
  const out = heading(seat, positionAt(plan.points, 0.6), SEATED_HEADING);
  if (elapsedMs < STAND_MS) return pose(seat, SEATED_HEADING, { clip: 'stand_up' });
  const waved = elapsedMs - STAND_MS;
  if (waved < WAVE_MS) {
    const t = Math.min(1, waved / TURN_MS);
    return pose(seat, SEATED_HEADING + shortest(SEATED_HEADING, out) * t, {
      clip: 'idle',
      bag: waved > WAVE_MS / 2,
    });
  }
  const walked = ((waved - WAVE_MS) / 1000) * WALK_SPEED;
  const at = positionAt(plan.points, walked);
  const facing = heading(at, positionAt(plan.points, walked + 0.4), SEATED_HEADING);
  if (walked < plan.walkMetres) return pose(at, facing, { clip: 'walk', bag: true });
  const sunk = ((walked - plan.walkMetres) / WALK_SPEED) * 1000;
  return sunk < SINK_MS
    ? pose(at, facing, { clip: 'walk', bag: true, scale: 1 - sunk / SINK_MS })
    : pose(at, facing, { gone: true, scale: 0 });
}
