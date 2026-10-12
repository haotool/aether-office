import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { paletteAt, type Stalk } from './stalk-layout.js';

const MERGE_COLOR = '#ffffff';
const WHITE = new Color('#ffffff');
const BEAD_SHINE = 0.45;

const matrix = new Matrix4();
const noTurn = new Quaternion();
const spot = new Vector3();
const scale3 = new Vector3();

export function beadRadii(stalk: Stalk): number[] {
  const heights = new Map<number, number[]>();
  for (const n of stalk.nodes)
    heights.set(n.strand, [...(heights.get(n.strand) ?? []), n.position[1]]);
  for (const list of heights.values()) list.sort((a, b) => a - b);
  return stalk.nodes.map((n) => {
    const list = heights.get(n.strand) ?? [];
    const at = list.indexOf(n.position[1]);
    const room = Math.min(
      (list[at + 1] ?? Infinity) - n.position[1],
      n.position[1] - (list[at - 1] ?? -Infinity),
    );
    const base = Math.max(0.16, (stalk.strands[n.strand]?.radius ?? 0) * 1.4);
    return Math.max(0.07, Math.min(n.merge ? base * 1.5 : base, room * 0.4));
  });
}

export function paintBeads(mesh: InstancedMesh, stalk: Stalk): void {
  const color = new Color();
  stalk.nodes.forEach((n, i) =>
    mesh.setColorAt(
      i,
      color.set(n.merge ? MERGE_COLOR : paletteAt(n.strand)).lerp(WHITE, n.merge ? 0 : BEAD_SHINE),
    ),
  );
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function placeBeads(
  mesh: InstancedMesh,
  stalk: Stalk,
  radii: readonly number[],
  reach: number,
): void {
  stalk.nodes.forEach((n, i) => {
    const scale = n.position[1] <= reach ? (radii[i] ?? 0) : 0;
    spot.set(n.position[0], n.position[1], n.position[2]);
    scale3.set(scale, scale, scale);
    mesh.setMatrixAt(i, matrix.compose(spot, noTurn, scale3));
  });
  mesh.instanceMatrix.needsUpdate = true;
}
