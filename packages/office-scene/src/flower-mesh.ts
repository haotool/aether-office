import * as THREE from 'three';

/** What a vertex is, so one shader can draw all of it. */
export const KIND = { petal: 0, tube: 1, glow: 3 } as const;

/** Everything the shader needs to know about a part of a flower, shared by the vertices of that part. */
export type Style = {
  /** The point the part opens or grows from. */
  hinge: THREE.Vector3;
  /** The axis a petal swings about (unit). */
  axis: THREE.Vector3;
  /** Radians a petal swings between bud and bloom. */
  swing: number;
  /** 0 to 1: how late in the bloom this part appears. */
  order: number;
  flower: number;
  kind: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
  /** Vein strength for a petal, intensity for glow. */
  detail: number;
  /** Translucency of a petal. */
  glass: number;
  /** Metres the part sways at the top of the breathing sway. */
  sway: number;
};

/** The attribute arrays of the whole garden, grown vertex by vertex. */
export class MeshBuilder {
  position: number[] = [];
  normal: number[] = [];
  hinge: number[] = [];
  axis: number[] = [];
  pose: number[] = [];
  look: number[] = [];
  tintA: number[] = [];
  tintB: number[] = [];
  index: number[] = [];

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, s: Style): number {
    this.position.push(p.x, p.y, p.z);
    this.normal.push(n.x, n.y, n.z);
    this.hinge.push(s.hinge.x, s.hinge.y, s.hinge.z);
    this.axis.push(s.axis.x, s.axis.y, s.axis.z);
    this.pose.push(s.swing, s.order, s.flower, s.kind);
    this.look.push(u, v, s.glass, s.sway);
    this.tintA.push(s.colorA.r, s.colorA.g, s.colorA.b, s.detail);
    this.tintB.push(s.colorB.r, s.colorB.g, s.colorB.b);
    return this.position.length / 3 - 1;
  }

  tri(a: number, b: number, c: number) {
    this.index.push(a, b, c);
  }

  /** Two triangles over four vertices in a ring (a, b, c, d). */
  quad(a: number, b: number, c: number, d: number) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  get triangles() {
    return this.index.length / 3;
  }

  /** A grid of `cols` by `rows` points laid out row after row, joined into triangles; returns the first vertex index. */
  grid(
    cols: number,
    rows: number,
    at: (i: number, j: number) => { p: THREE.Vector3; n: THREE.Vector3; u: number; v: number },
    style: Style,
  ) {
    const first = this.position.length / 3;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const { p, n, u, v } = at(i, j);
        this.vertex(p, n, u, v, style);
      }
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = first + j * cols + i;
        this.quad(a, a + 1, a + cols + 1, a + cols);
      }
    return first;
  }

  /**
   * A tube of `sides` sides about a path. `radius(t)` is its thickness at t in [0, 1] along it. Each ring is a fresh set of
   * vertices; normals point away from the path.
   */
  tube(path: THREE.Vector3[], radius: (t: number) => number, sides: number, style: Style) {
    const first = this.position.length / 3;
    let normal = new THREE.Vector3(0, 1, 0);
    path.forEach((p, i) => {
      const tangent = path[Math.min(i + 1, path.length - 1)]!.clone()
        .sub(path[Math.max(i - 1, 0)]!)
        .normalize();
      if (Math.abs(normal.dot(tangent)) > 0.95) normal = new THREE.Vector3(1, 0, 0);
      normal = normal.clone().addScaledVector(tangent, -normal.dot(tangent)).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, normal);
      const t = i / (path.length - 1);
      for (let s = 0; s < sides; s++) {
        const a = (2 * Math.PI * s) / sides;
        const out = normal
          .clone()
          .multiplyScalar(Math.cos(a))
          .addScaledVector(binormal, Math.sin(a));
        this.vertex(p.clone().addScaledVector(out, radius(t)), out, t, 0, {
          ...style,
          sway: style.sway * t,
        });
      }
    });
    for (let i = 0; i < path.length - 1; i++)
      for (let s = 0; s < sides; s++) {
        const a = first + i * sides + s;
        const b = first + i * sides + ((s + 1) % sides);
        this.quad(a, b, b + sides, a + sides);
      }
  }

  /** A square of light facing along `normal`, half-size `size` (a floret, a bead). */
  glowQuad(center: THREE.Vector3, normal: THREE.Vector3, size: number, style: Style) {
    const right = new THREE.Vector3()
      .crossVectors(
        normal,
        Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
      )
      .normalize();
    const up = new THREE.Vector3().crossVectors(right, normal);
    const corner = (x: number, y: number) =>
      this.vertex(
        center
          .clone()
          .addScaledVector(right, x * size)
          .addScaledVector(up, y * size),
        normal,
        x,
        y,
        style,
      );
    this.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const attribute = (name: string, data: number[], size: number) =>
      g.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
    attribute('position', this.position, 3);
    attribute('normal', this.normal, 3);
    attribute('hinge', this.hinge, 3);
    attribute('axis', this.axis, 3);
    attribute('pose', this.pose, 4);
    attribute('look', this.look, 4);
    attribute('tintA', this.tintA, 4);
    attribute('tintB', this.tintB, 3);
    g.setIndex(this.index);
    return g;
  }
}
