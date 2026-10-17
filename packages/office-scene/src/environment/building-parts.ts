import * as THREE from 'three';

type Spinner = { mesh: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number };
export type FloorModel = {
  group: THREE.Group;
  spinners: Spinner[];
  pulsers: {
    material: THREE.MeshStandardMaterial;
    base: number;
    amplitude: number;
    speed: number;
  }[];
  orbiters: {
    mesh: THREE.Object3D;
    rx: number;
    rz: number;
    y: number;
    speed: number;
    phase: number;
  }[];
  streams: { points: THREE.Points; speed: number; height: number }[];
  holograms: THREE.ShaderMaterial[];
};

export const emptyFloorModel = (): FloorModel => ({
  group: new THREE.Group(),
  spinners: [],
  pulsers: [],
  orbiters: [],
  streams: [],
  holograms: [],
});

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
