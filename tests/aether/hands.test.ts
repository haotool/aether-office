import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  Group,
  Object3D,
  Vector3,
} from '../../packages/office-scene/node_modules/three/build/three.module.js';
import { reachHands, type Hands } from '../../packages/office-scene/src/animals/hands.js';

type Node = {
  name: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
};
type Gltf = { nodes: Node[]; scenes: { nodes: number[] }[] };

const file = readFileSync('apps/web/public/assets/animals/fox-lod2.glb');
const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12))) as Gltf;

function build(index: number): Object3D {
  const node = gltf.nodes[index]!;
  const object = new Object3D();
  object.name = node.name;
  if (node.translation) object.position.fromArray(node.translation);
  if (node.rotation) object.quaternion.fromArray(node.rotation);
  if (node.scale) object.scale.fromArray(node.scale);
  for (const child of node.children ?? []) object.add(build(child));
  return object;
}

function fox() {
  const scene = new Group();
  for (const index of gltf.scenes[0]!.nodes) scene.add(build(index));
  return scene;
}

const at = (scene: Group, name: string) => {
  scene.updateMatrixWorld(true);
  return scene.getObjectByName(name)!.getWorldPosition(new Vector3());
};
const hands = (over: Partial<Hands> = {}): Hands => ({
  grip: 1,
  lean: 0,
  left: [0.11, 0.85, 0.35],
  right: [-0.11, 0.85, 0.35],
  ...over,
});
const point = (v: readonly [number, number, number]) => new Vector3(...v);
const SEGMENTS = ['upper_arm_L', 'forearm_L', 'hand_L', 'hand_socket_L'];

describe('hands that hold a folder', () => {
  it('bring the grip of each arm onto its target', () => {
    const scene = fox();
    const want = hands();
    reachHands(scene, want);
    expect(at(scene, 'hand_socket_L').distanceTo(point(want.left))).toBeLessThan(0.002);
    expect(at(scene, 'hand_socket_R').distanceTo(point(want.right))).toBeLessThan(0.002);
  });

  it('keep every arm segment as long as it was', () => {
    const scene = fox();
    const lengths = () =>
      SEGMENTS.slice(1).map((name, i) => at(scene, name).distanceTo(at(scene, SEGMENTS[i]!)));
    const before = lengths();
    reachHands(scene, hands());
    lengths().forEach((length, i) => expect(length).toBeCloseTo(before[i]!, 6));
  });

  it('leave the arms where the clip put them when nothing is held', () => {
    const scene = fox();
    const before = SEGMENTS.map((name) => at(scene, name));
    reachHands(scene, hands({ grip: 0 }));
    SEGMENTS.forEach((name, i) => expect(at(scene, name).distanceTo(before[i]!)).toBe(0));
  });

  it('blend from the clip toward the target as the grip comes on', () => {
    const scene = fox();
    const rest = at(scene, 'hand_socket_L');
    const want = hands();
    reachHands(scene, { ...want, grip: 0.5 });
    const halfway = at(scene, 'hand_socket_L').distanceTo(point(want.left));
    expect(halfway).toBeGreaterThan(0.02);
    expect(halfway).toBeLessThan(rest.distanceTo(point(want.left)));
  });

  it('let the arm go as straight as it can toward a target out of reach', () => {
    const scene = fox();
    const shoulder = at(scene, 'upper_arm_L');
    reachHands(scene, hands({ left: [0.19, 0.94, 2] }));
    const grip = at(scene, 'hand_socket_L');
    expect(grip.distanceTo(shoulder)).toBeGreaterThan(0.45);
    expect(Math.abs(grip.x - shoulder.x)).toBeLessThan(0.02);
    expect(Math.abs(grip.y - shoulder.y)).toBeLessThan(0.02);
  });

  it('keep the elbows down and out while the hands are in front', () => {
    const scene = fox();
    reachHands(scene, hands());
    const [shoulder, elbow, grip] = ['upper_arm_L', 'forearm_L', 'hand_socket_L'].map((name) =>
      at(scene, name),
    ) as [Vector3, Vector3, Vector3];
    expect(elbow.y).toBeLessThan(Math.min(shoulder.y, grip.y));
    expect(elbow.x).toBeGreaterThan((shoulder.x + grip.x) / 2);
  });

  it('lean the chest forward without moving where it stands', () => {
    const scene = fox();
    const chest = at(scene, 'chest');
    const neck = at(scene, 'neck');
    reachHands(scene, hands({ grip: 0, lean: 0.4 }));
    expect(at(scene, 'chest').distanceTo(chest)).toBeLessThan(1e-9);
    const leaned = at(scene, 'neck');
    expect(leaned.z).toBeGreaterThan(neck.z + 0.05);
    expect(leaned.y).toBeLessThan(neck.y);
    expect(leaned.distanceTo(chest)).toBeCloseTo(neck.distanceTo(chest), 6);
  });
});
