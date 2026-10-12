/** Geometry helpers adapted from AgentSystemLabs/agent-office (MIT), commit 665aeec.
 * Adapted from agent-office's src/client/world/toon.ts (MIT, AgentSystemLabs; the upstream application is no longer in this tree). See LICENSE and THIRD_PARTY_NOTICES.md.
 * AETHER uses PBR materials and explicit ownership instead of the upstream global toon cache.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Furniture repeats a few dozen box sizes (51 sizes in 291 boxes on one floor): extrude each once per merge pass.
const boxes = new Map<string, THREE.BufferGeometry>();
function roundedBox(w: number, h: number, d: number, r = 0.06, hole = 0): THREE.BufferGeometry {
  const key = `${w} ${h} ${d} ${r} ${hole}`;
  const cached = boxes.get(key);
  if (cached) return cached;
  const shape = new THREE.Shape();
  const x = -w / 2,
    y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  if (hole > 0) shape.holes.push(new THREE.Path().absarc(0, 0, hole, 0, 2 * Math.PI, true));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h / 2, 0);
  boxes.set(key, geo);
  return geo;
}
export function box(
  group: THREE.Group,
  material: THREE.Material,
  size: [number, number, number],
  position: [number, number, number],
  radius = 0.03,
  hole = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(roundedBox(...size, radius, hole), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
export function mergeStatic(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const originals = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const source = object.geometry;
    // Not clone(): a subclass's clone() first builds its default shape (an extrusion, a torus), then overwrites it.
    const geo = source.index ? source.toNonIndexed() : new THREE.BufferGeometry().copy(source);
    geo.applyMatrix4(object.matrixWorld);
    const values = groups.get(object.material) ?? [];
    values.push(geo);
    groups.set(object.material, values);
    originals.add(source);
  });
  const merged = new THREE.Group();
  for (const [material, geometries] of groups) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error('GEOMETRY_MERGE_FAILED');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !material.transparent;
    mesh.receiveShadow = true;
    merged.add(mesh);
    for (const geo of geometries) geo.dispose();
  }
  for (const geometry of originals) geometry.dispose();
  boxes.clear();
  return merged;
}
