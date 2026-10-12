import type { Vec3 } from './verlet.js';

export type Chair = { x: number; z: number; yaw: number; y: number };
type Anchors = { cross: Vec3; head: Vec3; handL: Vec3; handR: Vec3 };

export const MASTER_Y = 2.25;

const CROSS: Vec3 = [0, 2.7, 0];
const HEAD: Vec3 = [0, 1.46, 0];
const HAND_L: Vec3 = [-0.3, 0.7, -0.26];
const HAND_R: Vec3 = [0.3, 0.7, -0.26];

export function toWorld(chair: Chair, local: Vec3): Vec3 {
  const cos = Math.cos(chair.yaw);
  const sin = Math.sin(chair.yaw);
  return [
    chair.x + local[0] * cos + local[2] * sin,
    chair.y + local[1],
    chair.z - local[0] * sin + local[2] * cos,
  ];
}

export function seatedAnchors(chair: Chair): Anchors {
  return {
    cross: toWorld(chair, CROSS),
    head: toWorld(chair, HEAD),
    handL: toWorld(chair, HAND_L),
    handR: toWorld(chair, HAND_R),
  };
}

export type Sockets = { head: Vec3; handL: Vec3; handR: Vec3 };
type Socket = { matrixWorld: { elements: ArrayLike<number> } };
type Model = { getObjectByName(name: string): Socket | undefined };
type Rig = { head: Socket; handL: Socket; handR: Socket };
const rigs = new Map<string, Rig>();
const HEAD_LIFT_M = 0.08;

export function registerAnchors(id: string, root: Model): () => void {
  const head = root.getObjectByName('head_socket');
  const handL = root.getObjectByName('hand_socket_L');
  const handR = root.getObjectByName('hand_socket_R');
  if (!head || !handL || !handR) return () => undefined;
  const mine: Rig = { head, handL, handR };
  rigs.set(id, mine);
  return () => {
    if (rigs.get(id) === mine) rigs.delete(id);
  };
}

const world = (node: Socket): Vec3 => {
  const e = node.matrixWorld.elements;
  return [e[12] ?? 0, e[13] ?? 0, e[14] ?? 0];
};

/**
 * Null when none are registered or they are not placed yet: a model that has not been drawn is still at the origin, and
 * tying a string there would whip it across the room.
 */
export function anchorsOf(id: string): Sockets | null {
  const rig = rigs.get(id);
  if (!rig) return null;
  const head = world(rig.head);
  if (!Number.isFinite(head[0] + head[1] + head[2]) || Math.hypot(head[0], head[2]) < 1e-3)
    return null;
  const handL = world(rig.handL);
  const handR = world(rig.handR);
  return { head: [head[0], head[1] + HEAD_LIFT_M, head[2]], handL, handR };
}

export const chooseAnchors = (fixed: Anchors, sockets: Sockets | null): Anchors =>
  sockets ? { cross: fixed.cross, ...sockets } : fixed;
