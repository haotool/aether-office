/** Geometry helpers adapted from AgentSystemLabs/agent-office (MIT), commit 665aeec.
 * Original: src/client/world/toon.ts. See LICENSE and THIRD_PARTY_NOTICES.md.
 * AETHER uses PBR materials and explicit ownership instead of the upstream global toon cache.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
function roundedBox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
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
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h / 2, 0);
  geo.computeVertexNormals();
  return geo;
}
export function box(
  group: THREE.Group,
  material: THREE.Material,
  size: [number, number, number],
  position: [number, number, number],
  radius = 0.03,
): THREE.Mesh {
  const mesh = new THREE.Mesh(roundedBox(...size, radius), material);
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
    const geo = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geo.applyMatrix4(object.matrixWorld);
    const values = groups.get(object.material) ?? [];
    values.push(geo);
    groups.set(object.material, values);
    originals.add(object.geometry);
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
  return merged;
}
