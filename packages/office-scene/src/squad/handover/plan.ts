import type { NavGrid, Point } from '@aether/kernel';
import type { Hands, Vec3 } from '../../animals/hands.js';
import { positionAt } from '../../environment/carriers.js';
import { hashText } from '../../environment/hash.js';
import {
  CORE_RADIUS,
  SINK_MS,
  STAND_MS,
  WALK_PACE,
  WALK_SPEED,
  WALK_STRIDE_SPEED,
  WAVE_MS,
} from '../../animals/departure.js';
import { heading, length, pathIn, shortest, TURN_MS } from '../errand.js';
import { DESK_TOP, TRAY_X, TRAY_Z } from '../squad-art.js';
import type { StampKind } from './stamp.js';

export type HandoverMode = 'walk' | 'pop' | 'tray';

export const DESK_MS = 300;
export const REACH_MS = 350;
const RAISE_MS = 550;
export const LIFT_MS = REACH_MS + RAISE_MS;
export const LEAD_MS = DESK_MS + LIFT_MS;
export const GLIDE_MS = 700;
export const RELEASE_MS = 300;
export const READ_MS = 1500;
export const POP_MS = 600;
export const PRESS_MS = { down: 100, hold: 80, up: 70 } as const;
export const PRESS_TOTAL_MS = PRESS_MS.down + PRESS_MS.hold + PRESS_MS.up;
export const WALK_CAP_MS = 8000;
export const HELD_AHEAD_M = 0.375;
export const FOLDER_THICKNESS = 0.014;
export const TRAY_STACK_MAX = 5;

const HELD_Y = 0.82;
const DESK_AHEAD_M = 0.66;
const DESK_Y = DESK_TOP + FOLDER_THICKNESS / 2;
const GRIP_HALF_M = 0.11;
const LEAN_PICK = 0.5;
const LEAN_PLACE = 0.3;
const SEATED_HEADING = Math.PI;
const SPOT_X = TRAY_X + HELD_AHEAD_M;
const STAMP_X = 0.25;
const STAMP_Z = -0.22;
const TRAY_TOP_M = 0.08;

type Desk = { x: number; z: number; rotation: number };
type Frame = { x: number; z: number; yaw: number };

const toWorld = (frame: Frame, [x, y, z]: Vec3): Vec3 => {
  const cos = Math.cos(frame.yaw);
  const sin = Math.sin(frame.yaw);
  return [frame.x + x * cos + z * sin, y, frame.z - x * sin + z * cos];
};

export const askew = (seed: number, i: number) =>
  (((hashText(`${seed}:${i}`) % 200) - 100) / 100) * 0.14;
export const stackSkew = (slot: number) => askew(0, slot);

export type DeskPlaces = {
  spot: Point;
  tray: readonly [number, number, number];
  stamp: readonly [number, number, number];
  yaw: number;
};

export function handoverSide(desk: Desk, zone: { x: number; z: number }): 1 | -1 {
  const yaw = (desk.rotation * Math.PI) / 2;
  const local = (zone.x - desk.x) * Math.cos(yaw) - (zone.z - desk.z) * Math.sin(yaw);
  return local >= 0 ? 1 : -1;
}

export function deskPlaces(desk: Desk, side: 1 | -1): DeskPlaces {
  const frame = { x: desk.x, z: desk.z, yaw: (desk.rotation * Math.PI) / 2 };
  const spot = toWorld(frame, [side * SPOT_X, 0, TRAY_Z]);
  return {
    spot: { x: spot[0], z: spot[2] },
    tray: toWorld(frame, [side * TRAY_X, DESK_TOP + TRAY_TOP_M + FOLDER_THICKNESS / 2, TRAY_Z]),
    stamp: toWorld(frame, [side * STAMP_X, DESK_TOP, STAMP_Z]),
    yaw: frame.yaw + (side > 0 ? Math.PI : 0),
  };
}

export type Route = {
  toSpot: Point[];
  exit: Point[];
  exitMetres: number;
  face: number;
  speed: number;
  walkMs: number;
};

const toChairFrame = (chair: Point, frameYaw: number, p: Point): Point => {
  const dx = p.x - chair.x;
  const dz = p.z - chair.z;
  return {
    x: dx * Math.cos(frameYaw) - dz * Math.sin(frameYaw),
    z: dx * Math.sin(frameYaw) + dz * Math.cos(frameYaw),
  };
};

export function routeHandover(
  grid: NavGrid,
  chair: Point,
  frameYaw: number,
  places: DeskPlaces,
): Route {
  const toSpot = pathIn(grid, chair, places.spot, chair, frameYaw);
  const exit = pathIn(grid, places.spot, { x: 0, z: 0 }, chair, frameYaw);
  const spot = toSpot.at(-1) ?? places.spot;
  const tray = toChairFrame(chair, frameYaw, { x: places.tray[0], z: places.tray[2] });
  const walkMetres = length(toSpot);
  const speed = Math.max(WALK_SPEED, walkMetres / (WALK_CAP_MS / 1000));
  return {
    toSpot,
    exit,
    exitMetres: Math.max(0, length(exit) - CORE_RADIUS),
    face: heading(spot, tray, SEATED_HEADING),
    speed,
    walkMs: (walkMetres / speed) * 1000,
  };
}

type Timeline = {
  wait: number;
  liftAt: number;
  liftEnd: number;
  standEnd: number;
  walkEnd: number;
  turnEnd: number;
  placeAt: number;
  stampAt: number;
  total: number;
};

export function timeline(mode: HandoverMode, wait: number, route: Route): Timeline {
  if (mode === 'walk') {
    const liftAt = wait + DESK_MS;
    const liftEnd = wait + LEAD_MS;
    const standEnd = liftEnd + STAND_MS;
    const walkEnd = standEnd + route.walkMs;
    const turnEnd = walkEnd + TURN_MS;
    const placeAt = turnEnd + GLIDE_MS;
    const stampAt = placeAt + READ_MS;
    const exit = (route.exitMetres / WALK_SPEED) * 1000;
    return {
      wait,
      liftAt,
      liftEnd,
      standEnd,
      walkEnd,
      turnEnd,
      placeAt,
      stampAt,
      total: stampAt + WAVE_MS + exit + SINK_MS,
    };
  }
  const placeAt = wait + (mode === 'pop' ? POP_MS : 0);
  const stampAt = mode === 'pop' ? placeAt + READ_MS : placeAt;
  return {
    wait,
    liftAt: wait,
    liftEnd: wait,
    standEnd: wait,
    walkEnd: wait,
    turnEnd: wait,
    placeAt,
    stampAt,
    total: stampAt + (mode === 'pop' ? PRESS_TOTAL_MS : 0),
  };
}

export type HandoverPlan = {
  mode: HandoverMode;
  kind: StampKind;
  seed: number;
  origin: Point;
  frameYaw: number;
  places: DeskPlaces;
  side: 1 | -1;
  route: Route;
  t: Timeline;
};

export type MemberPose = {
  clip: 'stand_up' | 'walk' | 'idle' | null;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  pace: number;
  gone: boolean;
};

const ORIGIN: Point = { x: 0, z: 0 };

const pose = (at: Point, facing: number, over: Partial<MemberPose> = {}): MemberPose => ({
  clip: null,
  x: at.x,
  z: at.z,
  yaw: facing - SEATED_HEADING,
  scale: 1,
  pace: 1,
  gone: false,
  ...over,
});

function leavingPose({ route, t }: HandoverPlan, elapsed: number): MemberPose {
  const spot = route.toSpot.at(-1) ?? route.toSpot[0] ?? ORIGIN;
  const out = heading(spot, positionAt(route.exit, 0.6), SEATED_HEADING);
  const waved = elapsed - t.stampAt;
  if (waved < WAVE_MS)
    return pose(spot, route.face + shortest(route.face, out) * Math.min(1, waved / TURN_MS), {
      clip: 'idle',
    });
  const walked = ((waved - WAVE_MS) / 1000) * WALK_SPEED;
  const at = positionAt(route.exit, walked);
  const facing = heading(at, positionAt(route.exit, walked + 0.4), SEATED_HEADING);
  if (walked < route.exitMetres) return pose(at, facing, { clip: 'walk', pace: WALK_PACE });
  const sunk = ((walked - route.exitMetres) / WALK_SPEED) * 1000;
  return sunk < SINK_MS
    ? pose(at, facing, { clip: 'walk', pace: WALK_PACE, scale: 1 - sunk / SINK_MS })
    : pose(at, facing, { gone: true, scale: 0 });
}

export function memberAt(plan: HandoverPlan, elapsed: number): MemberPose {
  const { route, t } = plan;
  const [chair = ORIGIN] = route.toSpot;
  const spot = route.toSpot.at(-1) ?? chair;
  if (elapsed < t.liftEnd) return pose(chair, SEATED_HEADING);
  if (elapsed < t.standEnd) return pose(chair, SEATED_HEADING, { clip: 'stand_up' });
  if (elapsed < t.walkEnd) {
    const walked = ((elapsed - t.standEnd) / 1000) * route.speed;
    const at = positionAt(route.toSpot, walked);
    return pose(at, heading(at, positionAt(route.toSpot, walked + 0.4), SEATED_HEADING), {
      clip: 'walk',
      pace: route.speed / WALK_STRIDE_SPEED,
    });
  }
  const arrived = heading(route.toSpot[route.toSpot.length - 2] ?? chair, spot, SEATED_HEADING);
  if (elapsed < t.turnEnd) {
    const k = (elapsed - t.walkEnd) / TURN_MS;
    return pose(spot, arrived + shortest(arrived, route.face) * k, { clip: 'idle' });
  }
  if (elapsed < t.stampAt) return pose(spot, route.face, { clip: 'idle' });
  return leavingPose(plan, elapsed);
}

const unit = (k: number) => Math.min(1, Math.max(0, k));
const ease = (k: number) => k * k * (3 - 2 * k);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const overshoot = (k: number) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
const appear = (elapsed: number, over: number) => Math.max(0.001, overshoot(unit(elapsed / over)));

type Carry = { ahead: number; y: number; grip: number; lean: number };

const trayY = (plan: HandoverPlan, slot: number) =>
  plan.places.tray[1] + Math.min(slot, TRAY_STACK_MAX - 1) * FOLDER_THICKNESS;

function carryAt(plan: HandoverPlan, elapsed: number, slot: number): Carry {
  const { t } = plan;
  if (elapsed < t.liftAt) return { ahead: DESK_AHEAD_M, y: DESK_Y, grip: 0, lean: 0 };
  if (elapsed < t.liftEnd) {
    const lifted = elapsed - t.liftAt;
    const reach = ease(unit(lifted / REACH_MS));
    const raise = ease(unit((lifted - REACH_MS) / RAISE_MS));
    return {
      ahead: mix(DESK_AHEAD_M, HELD_AHEAD_M, raise),
      y: mix(DESK_Y, HELD_Y, raise),
      grip: reach,
      lean: LEAN_PICK * (reach - raise),
    };
  }
  if (elapsed < t.turnEnd) return { ahead: HELD_AHEAD_M, y: HELD_Y, grip: 1, lean: 0 };
  const lowered = ease(unit((elapsed - t.turnEnd) / GLIDE_MS));
  const released = ease(unit((elapsed - t.placeAt) / RELEASE_MS));
  return {
    ahead: HELD_AHEAD_M,
    y: mix(HELD_Y, trayY(plan, slot), lowered),
    grip: 1 - released,
    lean: LEAN_PLACE * lowered * (1 - released),
  };
}

export function handsAt(plan: HandoverPlan, elapsed: number, slot: number): Hands {
  const { ahead, y, grip, lean } = carryAt(plan, elapsed, slot);
  return { grip, lean, left: [GRIP_HALF_M, y, ahead], right: [-GRIP_HALF_M, y, ahead] };
}

type FolderPose = {
  state: 'hidden' | 'desk' | 'held' | 'pop';
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
};
const HIDDEN: FolderPose = { state: 'hidden', x: 0, y: 0, z: 0, yaw: 0, scale: 0 };

export function folderAt(plan: HandoverPlan, elapsed: number, slot: number): FolderPose {
  const { t } = plan;
  if (elapsed >= t.placeAt || plan.mode === 'tray') return HIDDEN;
  if (plan.mode === 'pop') {
    if (elapsed < t.wait) return HIDDEN;
    return {
      state: 'pop',
      x: plan.places.tray[0],
      y: trayY(plan, slot),
      z: plan.places.tray[2],
      yaw: plan.places.yaw + stackSkew(slot),
      scale: appear(elapsed - t.wait, POP_MS),
    };
  }
  const { ahead, y } = carryAt(plan, elapsed, slot);
  const body = memberAt(plan, Math.min(elapsed, t.turnEnd));
  const facing = body.yaw + SEATED_HEADING;
  const frame = { x: plan.origin.x, z: plan.origin.z, yaw: plan.frameYaw };
  const [x, , z] = toWorld(frame, [
    body.x + Math.sin(facing) * ahead,
    y,
    body.z + Math.cos(facing) * ahead,
  ]);
  const carried = facing - Math.PI / 2 + frame.yaw;
  const settled = ease(unit((elapsed - t.turnEnd) / GLIDE_MS));
  const landing = plan.places.yaw + stackSkew(slot);
  return {
    state: elapsed < t.liftAt + REACH_MS ? 'desk' : 'held',
    x,
    y,
    z,
    yaw: carried + shortest(carried, landing) * settled,
    scale: appear(elapsed, DESK_MS),
  };
}

export const sealAt = (plan: HandoverPlan): number =>
  plan.t.stampAt + (plan.mode === 'tray' ? 0 : PRESS_MS.down);

export function pressAt(plan: HandoverPlan, elapsed: number): number {
  if (plan.mode === 'tray') return 0;
  const k = elapsed - plan.t.stampAt;
  if (k < 0 || k >= PRESS_TOTAL_MS) return 0;
  if (k < PRESS_MS.down) return (k / PRESS_MS.down) ** 2;
  if (k < PRESS_MS.down + PRESS_MS.hold) return 1;
  return 1 - (k - PRESS_MS.down - PRESS_MS.hold) / PRESS_MS.up;
}
