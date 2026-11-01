import { MathUtils, Matrix4, Quaternion, Vector3, type Object3D } from 'three';

export type Vec3 = readonly [number, number, number];
export type Hands = { grip: number; lean: number; left: Vec3; right: Vec3 };

type Arm = { upper: Object3D; fore: Object3D; grip: Object3D; side: 1 | -1 };
type Rig = { chest: Object3D; arms: Arm[] };

const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;
const ELBOW_HANGS = new Vector3(0.35, -1, -0.15);
const LATERAL = new Vector3(1, 0, 0);
const SLACK = 1e-3;
const rigs = new WeakMap<Object3D, Rig | null>();

function rigOf(scene: Object3D): Rig | null {
  if (rigs.has(scene)) return rigs.get(scene) ?? null;
  const chest = scene.getObjectByName('chest');
  const arms = SIDES.flatMap(([name, side]) => {
    const upper = scene.getObjectByName(`upper_arm_${name}`);
    const fore = scene.getObjectByName(`forearm_${name}`);
    const grip = scene.getObjectByName(`hand_socket_${name}`);
    return upper && fore && grip ? [{ upper, fore, grip, side }] : [];
  });
  const rig = chest && arms.length === SIDES.length ? { chest, arms } : null;
  rigs.set(scene, rig);
  return rig;
}

function modelMatrix(node: Object3D, scene: Object3D): Matrix4 {
  const matrix = new Matrix4();
  for (let n: Object3D | null = node; n && n !== scene; n = n.parent) {
    n.updateMatrix();
    matrix.premultiply(n.matrix);
  }
  return matrix;
}

const placeOf = (node: Object3D, scene: Object3D) =>
  new Vector3().setFromMatrixPosition(modelMatrix(node, scene));
const turnOf = (node: Object3D, scene: Object3D) =>
  new Quaternion().setFromRotationMatrix(modelMatrix(node, scene));
const aim = (from: Vector3, to: Vector3) =>
  new Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());

function elbowFor(shoulder: Vector3, target: Vector3, upper: number, fore: number, side: number) {
  const span = target.clone().sub(shoulder);
  const reach = MathUtils.clamp(
    span.length(),
    Math.abs(upper - fore) + SLACK,
    upper + fore - SLACK,
  );
  const along = span.normalize();
  const near = (upper ** 2 - fore ** 2 + reach ** 2) / (2 * reach);
  const bow = Math.sqrt(Math.max(0, upper ** 2 - near ** 2));
  const hang = new Vector3(ELBOW_HANGS.x * side, ELBOW_HANGS.y, ELBOW_HANGS.z);
  hang.addScaledVector(along, -hang.dot(along));
  if (hang.lengthSq() < SLACK ** 2) hang.set(0, 0, -1);
  return shoulder.clone().addScaledVector(along, near).addScaledVector(hang.normalize(), bow);
}

function reachArm(scene: Object3D, arm: Arm, target: Vector3, weight: number) {
  const { upper, fore, grip, side } = arm;
  const shoulder = placeOf(upper, scene);
  const elbow = placeOf(fore, scene);
  const hand = placeOf(grip, scene);
  const bent = elbowFor(shoulder, target, shoulder.distanceTo(elbow), elbow.distanceTo(hand), side);
  const swing = aim(elbow.clone().sub(shoulder), bent.clone().sub(shoulder));
  const upperTurn = swing.clone().multiply(turnOf(upper, scene));
  const foreTurn = aim(hand.sub(elbow).applyQuaternion(swing), target.clone().sub(bent))
    .multiply(swing)
    .multiply(turnOf(fore, scene));
  const chest = turnOf(upper.parent as Object3D, scene);
  upper.quaternion.slerp(chest.invert().multiply(upperTurn), weight);
  fore.quaternion.slerp(upperTurn.clone().invert().multiply(foreTurn), weight);
}

function leanChest(scene: Object3D, chest: Object3D, radians: number) {
  const parent = turnOf(chest.parent as Object3D, scene);
  const turned = new Quaternion()
    .setFromAxisAngle(LATERAL, radians)
    .multiply(parent.clone().multiply(chest.quaternion));
  chest.quaternion.copy(parent.invert().multiply(turned));
}

export function reachHands(scene: Object3D, hands: Hands) {
  const rig = rigOf(scene);
  if (!rig) return;
  if (hands.lean !== 0) leanChest(scene, rig.chest, hands.lean);
  if (hands.grip <= 0) return;
  for (const arm of rig.arms)
    reachArm(scene, arm, new Vector3(...(arm.side > 0 ? hands.left : hands.right)), hands.grip);
}
