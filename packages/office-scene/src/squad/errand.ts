import { findPath, type NavGrid, type Point } from '@aether/kernel';
import { positionAt } from '../environment/carriers.js';
import {
  CORE_RADIUS,
  SINK_MS,
  STAND_MS,
  WALK_SPEED,
  pathLength,
  WAVE_MS,
  type Departure,
} from '../animals/departure.js';
import type { Quality } from '../scene/scene-types.js';
import { ARRIVE_MS } from './squad-model.js';

const POD_RADIUS = 0.6;
export const TURN_MS = 400;
export const SIT_MS = 1000;
const MATERIALIZE_MS = 800;
const WALK_LIMIT: Record<Quality, number> = { high: 14, balanced: 10, low: 0 };
const SEATED_HEADING = Math.PI;

type ArrivalMode = 'walk' | 'materialize' | 'appear';
type Frame = { origin: Point; frameYaw: number };
export type Arrival = Frame & {
  points: Point[];
  mode: ArrivalMode;
  speed: number;
};
export type Leave = Frame & { plan: Departure };
export type ErrandPose = {
  clip: 'walk' | 'idle' | null;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  hidden: boolean;
  done: boolean;
};

export const length = pathLength;
export const heading = (from: Point, to: Point, otherwise: number) =>
  from.x === to.x && from.z === to.z ? otherwise : Math.atan2(to.x - from.x, to.z - from.z);
export const shortest = (a: number, b: number) =>
  ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

export function blockPods(grid: NavGrid, pods: readonly Point[], except?: Point): NavGrid {
  const blocked = grid.blocked.slice();
  for (const pod of pods) {
    if (except && pod.x === except.x && pod.z === except.z) continue;
    for (let r = 0; r < grid.rows; r++)
      for (let c = 0; c < grid.cols; c++)
        if (
          Math.hypot(grid.minX + c * grid.cell - pod.x, grid.minZ + r * grid.cell - pod.z) <
          POD_RADIUS
        )
          blocked[r * grid.cols + c] = 1;
  }
  return { ...grid, blocked };
}

export function pathIn(
  grid: NavGrid,
  from: Point,
  to: Point,
  chair: Point,
  frameYaw: number,
): Point[] {
  const found = findPath(grid, from, to);
  const world = found.status === 'ok' ? [from, ...found.points.slice(1, -1), to] : [from, to];
  const cos = Math.cos(frameYaw);
  const sin = Math.sin(frameYaw);
  return world.map((p) => {
    const dx = p.x - chair.x;
    const dz = p.z - chair.z;
    return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
  });
}

export function arrivalMode(metres: number, quality: Quality, reducedMotion: boolean): ArrivalMode {
  if (reducedMotion) return 'appear';
  return WALK_LIMIT[quality] > 0 && metres <= WALK_LIMIT[quality] ? 'walk' : 'materialize';
}

export function planArrival(
  grid: NavGrid,
  chair: Point,
  frameYaw: number,
  quality: Quality,
  reducedMotion: boolean,
): Arrival {
  const points = pathIn(grid, { x: 0, z: 0 }, chair, chair, frameYaw);
  const mode = arrivalMode(Math.max(0, length(points) - CORE_RADIUS), quality, reducedMotion);
  const walking = (ARRIVE_MS - TURN_MS - SIT_MS) / 1000;
  return {
    origin: chair,
    frameYaw,
    points,
    mode,
    speed: Math.max(WALK_SPEED, length(points) / walking),
  };
}

export function planLeave(grid: NavGrid, chair: Point, frameYaw: number): Leave {
  const points = pathIn(grid, chair, { x: 0, z: 0 }, chair, frameYaw);
  return {
    origin: chair,
    frameYaw,
    plan: { points, walkMetres: Math.max(0, length(points) - CORE_RADIUS), deskYaw: 0 },
  };
}

export const leaveDuration = ({ plan }: Leave): number =>
  STAND_MS + WAVE_MS + (plan.walkMetres / WALK_SPEED) * 1000 + SINK_MS;

export function arrivalAt(plan: Arrival, elapsedMs: number): ErrandPose {
  const pose = (at: Point, facing: number, over: Partial<ErrandPose>): ErrandPose => ({
    clip: null,
    x: at.x,
    z: at.z,
    yaw: facing - SEATED_HEADING,
    scale: 1,
    hidden: false,
    done: false,
    ...over,
  });
  const chair = { x: 0, z: 0 };
  const seated = (over: Partial<ErrandPose> = {}) => pose(chair, SEATED_HEADING, over);
  if (plan.mode === 'appear' || elapsedMs >= ARRIVE_MS) return seated({ done: true });
  if (elapsedMs < 0) return seated({ hidden: true, scale: 0 });
  if (plan.mode === 'materialize')
    return seated({
      scale: Math.min(1, elapsedMs / MATERIALIZE_MS),
      done: elapsedMs >= MATERIALIZE_MS,
    });
  const total = length(plan.points);
  const walked = (elapsedMs / 1000) * plan.speed;
  if (walked < total) {
    const at = positionAt(plan.points, walked);
    return pose(at, heading(at, positionAt(plan.points, walked + 0.4), SEATED_HEADING), {
      clip: 'walk',
      scale: Math.max(0.001, Math.min(1, walked / CORE_RADIUS)),
    });
  }
  const turned = ((walked - total) / plan.speed) * 1000;
  if (turned >= TURN_MS) return seated({ done: true });
  const arrived = heading(plan.points[plan.points.length - 2] ?? chair, chair, SEATED_HEADING);
  return pose(chair, arrived + shortest(arrived, SEATED_HEADING) * (turned / TURN_MS), {
    clip: 'idle',
  });
}
