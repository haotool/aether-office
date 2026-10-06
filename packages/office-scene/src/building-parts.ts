import * as THREE from 'three';

/** What a floor builds, and the small solids its parts are made from. */
type Spinner = { mesh: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number };
/** What a floor builds: merged static geometry (cheap to draw) and the few moving parts kept apart so they can animate. */
export type FloorModel = {
  group: THREE.Group;
  spinners: Spinner[];
  pulsers: { material: THREE.Material; base: number; amplitude: number; speed: number }[];
  /** Small lit craft gliding along an ellipse above the floor. */
  orbiters: {
    mesh: THREE.Object3D;
    rx: number;
    rz: number;
    y: number;
    speed: number;
    phase: number;
  }[];
  /** A light plane that sweeps the floor from front to back and starts over. */
  sweepers: { mesh: THREE.Object3D; from: number; to: number; speed: number }[];
  /** Rising points of light (the data column in the elevator core): positions are advanced every frame. */
  streams: { points: THREE.Points; speed: number; height: number }[];
  /** Hologram materials whose `time` uniform the scene advances. */
  holograms: THREE.ShaderMaterial[];
};

export function ring(
  m: THREE.Material,
  radius: number,
  tube: number,
  y: number,
  parent: THREE.Object3D,
  x = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 96), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function cylinder(
  parent: THREE.Object3D,
  m: THREE.Material,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  segments = 32,
  open = false,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, open),
    m,
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}
