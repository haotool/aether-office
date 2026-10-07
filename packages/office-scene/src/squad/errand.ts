// A subagent's walks: out of the elevator core to its pod (arrive) and from its pod back into the core (leave). Pure, like
// departure.ts, whose clips, timings and poses they share. Both run in the seat's own frame: the origin is the chair and
// the member sits looking along -z, as in a desk's frame, so a walker is drawn by a group put at `origin` and turned by
// `frameYaw`, with the plan's coordinates inside it (a pod faces any of four ways).
import { findPath, type NavGrid, type Point } from '@aether/kernel';
import { positionAt } from '../carriers.js';
import {
  CORE_RADIUS,
  SINK_MS,
  STAND_MS,
  WALK_SPEED,
  WAVE_MS,
  type Departure,
} from '../departure.js';
import type { Quality } from '../scene-types.js';
import { ARRIVE_MS } from './squad-model.js';

/** Radius of the floor a seated subagent and its stool take up: others walk round it. */
const POD_RADIUS = 0.6;
/** The turn to face the supervisor and the sit (the sit_down clip's length). */
export const TURN_MS = 400;
export const SIT_MS = 1000;
export const MATERIALIZE_MS = 800;
/** The longest walk each tier shows; a farther pod, or a lower tier, has the subagent appear in its seat instead. */
const WALK_LIMIT: Record<Quality, number> = { high: 14, balanced: 10, low: 0 };
/** Facing the desk, in the seat's frame (the model looks along +z and the chair is behind the desk). */
const SEATED_HEADING = Math.PI;

export type ArrivalMode = 'walk' | 'materialize' | 'appear';
/** Where a walker stands and how its frame is turned in the world. */
export type Frame = { origin: Point; frameYaw: number };
export type Arrival = Frame & {
  /** The core, then the way to the chair, in the seat's frame (the chair is the origin). */
  points: Point[];
  mode: ArrivalMode;
  /** Metres per second: sped up for a long walk so the whole arrival fits in `ARRIVE_MS`. */
  speed: number;
};
export type Leave = Frame & { plan: Departure };
export type ErrandPose = {
  /** The clip the member is held to, or null once it sits and its own activity takes over. */
  clip: 'walk' | 'idle' | null;
  /** Offset from the chair, the turn to add to the seated one, and the size. */
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** Not yet there (before the start). */
  hidden: boolean;
  /** Seated: the member is an ordinary seated one from here on, and sits down. */
  done: boolean;
};

export const length = (points: readonly Point[]) =>
  points.reduce(
    (sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z) : 0),
    0,
  );
export const heading = (from: Point, to: Point, otherwise: number) =>
  from.x === to.x && from.z === to.z ? otherwise : Math.atan2(to.x - from.x, to.z - from.z);
export const shortest = (a: number, b: number) =>
  ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** A copy of the grid with a round pod blocked for each of the given seats (the walker's own is left open). */
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

/** The path between two points, in the frame of a chair turned by `frameYaw`. Straight when no way is found: only a picture. */
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

/** How a subagent comes in: the walk from the core, or (a far pod, a low tier, reduced motion) appearing in its seat. */
export function arrivalMode(metres: number, quality: Quality, reducedMotion: boolean): ArrivalMode {
  if (reducedMotion) return 'appear';
  return WALK_LIMIT[quality] > 0 && metres <= WALK_LIMIT[quality] ? 'walk' : 'materialize';
}

/** The way out of the core to a chair, for a seat turned by `frameYaw` (a desk's quarter turns, in radians). */
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

/** The way from a chair back into the core: a departure (see departure.ts) in the seat's frame. */
export function planLeave(grid: NavGrid, chair: Point, frameYaw: number): Leave {
  const points = pathIn(grid, chair, { x: 0, z: 0 }, chair, frameYaw);
  return {
    origin: chair,
    frameYaw,
    plan: { points, walkMetres: Math.max(0, length(points) - CORE_RADIUS), deskYaw: 0 },
  };
}

/** How long a member takes to leave: stand, wave, walk, sink. The model forgets it after that. */
export const leaveDuration = ({ plan }: Leave): number =>
  STAND_MS + WAVE_MS + (plan.walkMetres / WALK_SPEED) * 1000 + SINK_MS;

/** Where an arriving member is, `elapsedMs` after it began. */
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
      scale: Math.max(0.001, Math.min(1, walked / CORE_RADIUS)), // out of the core's glass: the reverse of the sink
    });
  }
  const turned = ((walked - total) / plan.speed) * 1000;
  if (turned >= TURN_MS) return seated({ done: true });
  const arrived = heading(plan.points[plan.points.length - 2] ?? chair, chair, SEATED_HEADING);
  return pose(chair, arrived + shortest(arrived, SEATED_HEADING) * (turned / TURN_MS), {
    clip: 'idle',
  });
}
