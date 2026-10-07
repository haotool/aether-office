// Where a subagent's strings are tied. The cross floats over the head; the strings run to the head and the two hands.
// The fixed offsets of a seated character in the chair's frame (v1), and the character's own head and hand sockets when
// its rig registered them (v2: the hand strings then follow the typing clip).
import type { Vec3 } from './verlet.js';

/** The chair's place and its turn about the vertical (the pod faces any of four ways); `y` is the floor's height. */
export type Chair = { x: number; z: number; yaw: number; y: number };
export type Anchors = { cross: Vec3; head: Vec3; handL: Vec3; handR: Vec3 };

/** The master thread ends this high over the supervisor's chair: at its halo (`HALO_Y` in SquadBeam.tsx). */
export const MASTER_Y = 2.25;

/** In the chair's frame (the sitter looks along -z): 1.25 m over the head, the head's top, the hands on the desk. */
const CROSS: Vec3 = [0, 2.7, 0];
const HEAD: Vec3 = [0, 1.46, 0];
const HAND_L: Vec3 = [-0.3, 0.7, -0.26];
const HAND_R: Vec3 = [0.3, 0.7, -0.26];

/** A point of the chair's frame in the floor's (the same quarter turn a pod's group gets). */
export function toWorld(chair: Chair, local: Vec3): Vec3 {
  const cos = Math.cos(chair.yaw);
  const sin = Math.sin(chair.yaw);
  return [
    chair.x + local[0] * cos + local[2] * sin,
    chair.y + local[1],
    chair.z - local[0] * sin + local[2] * cos,
  ];
}

/** The fixed anchors of a seated character (v1). */
export function seatedAnchors(chair: Chair): Anchors {
  return {
    cross: toWorld(chair, CROSS),
    head: toWorld(chair, HEAD),
    handL: toWorld(chair, HAND_L),
    handR: toWorld(chair, HAND_R),
  };
}

/** The character's sockets in the world: the head's, and the two hands'. */
export type Sockets = { head: Vec3; handL: Vec3; handR: Vec3 };
/** What a registered model has to offer: named nodes with a world matrix (a three.js `Object3D`). */
type Socket = { matrixWorld: { elements: ArrayLike<number> } };
type Model = { getObjectByName(name: string): Socket | undefined };
type Rig = { head: Socket; handL: Socket; handR: Socket };
const rigs = new Map<string, Rig>();
/** The head string ties a hand's breadth over the head socket, on the top of the head. */
const HEAD_LIFT_M = 0.08;

/**
 * Remembers where a character's head and hand sockets are (named nodes of the model, see tools/blender/animal_rig.py), so
 * the puppet strings can tie to the real thing. Returns the call that forgets them. A model without the three sockets
 * registers nothing: its strings keep to the fixed offsets.
 */
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

/** The world position of a node as of the last time the scene updated its matrices (the frame before: one frame of lag, no cost). */
const world = (node: Socket): Vec3 => {
  const e = node.matrixWorld.elements;
  return [e[12]!, e[13]!, e[14]!];
};

/**
 * Where the sockets of a character are in the world now, or null when it has none registered or they are not placed yet
 * (a model that has not been drawn is still at the origin, and tying a string there would whip it across the room).
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

/** The anchors of a subagent: the rig's own sockets when it has them, else the fixed offsets. */
export const chooseAnchors = (fixed: Anchors, sockets: Sockets | null): Anchors =>
  sockets ? { cross: fixed.cross, ...sockets } : fixed;
