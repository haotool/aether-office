import type { NavGrid, Point } from '@aether/kernel';
import { positionAt } from '../../environment/carriers.js';
import {
  CORE_RADIUS,
  SINK_MS,
  STAND_MS,
  WALK_PACE,
  WALK_SPEED,
  WALK_STRIDE_SPEED,
  WAVE_MS,
} from '../../animals/departure.js';
import { toWorld } from '../puppet/anchors.js';
import { heading, length, pathIn, shortest, TURN_MS } from '../errand.js';
import { DESK_TOP } from '../squad-art.js';
import type { StampKind } from './stamp.js';

export type HandoverMode = 'walk' | 'pop' | 'tray';

export const GLIDE_MS = 600;
export const READ_MS = 1500;
export const POP_MS = 600;
export const PRESS_MS = { down: 100, hold: 80, up: 70 } as const;
export const PRESS_TOTAL_MS = PRESS_MS.down + PRESS_MS.hold + PRESS_MS.up;
export const WALK_CAP_MS = 8000;
const HELD_AHEAD_M = 0.35;
const HELD_Y = 1.0;
export const FOLDER_THICKNESS = 0.014;
export const TRAY_STACK_MAX = 5;

const SEATED_HEADING = Math.PI;
const SPOT_X = 1.25;
const SPOT_Z = -0.1;
const TRAY_X = 0.55;
const TRAY_Z = -0.18;
const STAMP_X = 0.25;
const STAMP_Z = -0.22;
const TRAY_TOP_M = 0.08;

type Desk = { x: number; z: number; rotation: number };
export type DeskPlaces = {
  spot: Point;
  tray: readonly [number, number, number];
  stamp: readonly [number, number, number];
};

export function handoverSide(desk: Desk, zone: { x: number; z: number }): 1 | -1 {
  const yaw = (desk.rotation * Math.PI) / 2;
  const local = (zone.x - desk.x) * Math.cos(yaw) - (zone.z - desk.z) * Math.sin(yaw);
  return local >= 0 ? 1 : -1;
}

export function deskPlaces(desk: Desk, side: 1 | -1): DeskPlaces {
  const frame = { x: desk.x, z: desk.z, yaw: (desk.rotation * Math.PI) / 2, y: 0 };
  const spot = toWorld(frame, [side * SPOT_X, 0, SPOT_Z]);
  return {
    spot: { x: spot[0], z: spot[2] },
    tray: toWorld(frame, [side * TRAY_X, DESK_TOP + TRAY_TOP_M + FOLDER_THICKNESS / 2, TRAY_Z]),
    stamp: toWorld(frame, [side * STAMP_X, DESK_TOP, STAMP_Z]),
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
  standEnd: number;
  walkEnd: number;
  turnEnd: number;
  placeAt: number;
  stampAt: number;
  total: number;
};

export function timeline(mode: HandoverMode, wait: number, route: Route): Timeline {
  if (mode === 'walk') {
    const standEnd = wait + STAND_MS;
    const walkEnd = standEnd + route.walkMs;
    const turnEnd = walkEnd + TURN_MS;
    const placeAt = turnEnd + GLIDE_MS;
    const stampAt = placeAt + READ_MS;
    const exit = (route.exitMetres / WALK_SPEED) * 1000;
    return {
      wait,
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
  clip: 'stand_up' | 'walk' | 'idle' | 'wave' | null;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  pace: number;
  carrying: boolean;
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
  carrying: true,
  gone: false,
  ...over,
});

function leavingPose({ route, t }: HandoverPlan, elapsed: number): MemberPose {
  const spot = route.toSpot.at(-1) ?? route.toSpot[0] ?? ORIGIN;
  const out = heading(spot, positionAt(route.exit, 0.6), SEATED_HEADING);
  const waved = elapsed - t.stampAt;
  if (waved < WAVE_MS)
    return pose(spot, route.face + shortest(route.face, out) * Math.min(1, waved / TURN_MS), {
      clip: 'wave',
      carrying: false,
    });
  const walked = ((waved - WAVE_MS) / 1000) * WALK_SPEED;
  const at = positionAt(route.exit, walked);
  const facing = heading(at, positionAt(route.exit, walked + 0.4), SEATED_HEADING);
  if (walked < route.exitMetres)
    return pose(at, facing, { clip: 'walk', pace: WALK_PACE, carrying: false });
  const sunk = ((walked - route.exitMetres) / WALK_SPEED) * 1000;
  return sunk < SINK_MS
    ? pose(at, facing, {
        clip: 'walk',
        pace: WALK_PACE,
        carrying: false,
        scale: 1 - sunk / SINK_MS,
      })
    : pose(at, facing, { carrying: false, gone: true, scale: 0 });
}

export function memberAt(plan: HandoverPlan, elapsed: number): MemberPose {
  const { route, t } = plan;
  const [chair = ORIGIN] = route.toSpot;
  const spot = route.toSpot.at(-1) ?? chair;
  if (elapsed < t.wait) return pose(chair, SEATED_HEADING);
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
  if (elapsed < t.stampAt)
    return pose(spot, route.face, { clip: 'idle', carrying: elapsed < t.placeAt });
  return leavingPose(plan, elapsed);
}

type FolderPose = {
  state: 'hidden' | 'held' | 'glide' | 'pop';
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
};
const HIDDEN: FolderPose = { state: 'hidden', x: 0, y: 0, z: 0, yaw: 0, scale: 0 };

const ease = (k: number) => k * k * (3 - 2 * k);
const overshoot = (k: number) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);

export function folderAt(plan: HandoverPlan, elapsed: number, slot: number): FolderPose {
  const { t } = plan;
  const trayY = plan.places.tray[1] + Math.min(slot, TRAY_STACK_MAX - 1) * FOLDER_THICKNESS;
  const tray = { x: plan.places.tray[0], z: plan.places.tray[2] };
  if (elapsed >= t.placeAt) return HIDDEN;
  const frame = { x: plan.origin.x, z: plan.origin.z, yaw: plan.frameYaw, y: 0 };
  const yaw = (plan.seed % 628) / 100;
  if (plan.mode === 'pop') {
    if (elapsed < t.wait) return HIDDEN;
    const k = Math.min(1, (elapsed - t.wait) / POP_MS);
    return {
      state: 'pop',
      x: tray.x,
      y: trayY,
      z: tray.z,
      yaw,
      scale: Math.max(0.001, overshoot(k)),
    };
  }
  if (plan.mode === 'tray') return HIDDEN;
  const body = memberAt(plan, Math.min(elapsed, t.turnEnd));
  const facing = body.yaw + SEATED_HEADING;
  const bob = 0.015 * Math.sin((elapsed / 1000) * 1.6 * 2 * Math.PI + (plan.seed % 7));
  const held = toWorld(frame, [
    body.x + Math.sin(facing) * HELD_AHEAD_M,
    HELD_Y + bob,
    body.z + Math.cos(facing) * HELD_AHEAD_M,
  ]);
  if (elapsed < t.turnEnd)
    return { state: 'held', x: held[0], y: held[1], z: held[2], yaw: facing + frame.yaw, scale: 1 };
  const k = ease((elapsed - t.turnEnd) / GLIDE_MS);
  const arc = 0.12 * Math.sin(k * Math.PI);
  return {
    state: 'glide',
    x: held[0] + (tray.x - held[0]) * k,
    y: held[1] + (trayY - held[1]) * k + arc,
    z: held[2] + (tray.z - held[2]) * k,
    yaw: yaw * k + (facing + frame.yaw) * (1 - k),
    scale: 1,
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
