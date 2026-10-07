// The puppet rig's shared parts: the control cross (a bar of light with three glowing nodes), one geometry for every
// subagent in the scene, painted in vertex colours so the instanced mesh uses the squad layers' one shader.
import { BoxGeometry, BufferAttribute, Color, SphereGeometry, type BufferGeometry } from 'three';
import { merged } from '../squad-art.js';

const paint = (g: BufferGeometry, hex: string): BufferGeometry => {
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g.index ? g.toNonIndexed() : g;
};

let cross: BufferGeometry | null = null;
/** A thin bar 0.34 m wide with a node at each end and one in the middle: about 100 triangles. */
export const crossGeometry = (): BufferGeometry =>
  (cross ??= merged([
    paint(new BoxGeometry(0.34, 0.014, 0.014), '#ffffff'),
    paint(new SphereGeometry(0.03, 8, 6).translate(-0.17, 0, 0), '#ffffff'),
    paint(new SphereGeometry(0.03, 8, 6).translate(0.17, 0, 0), '#ffffff'),
    paint(new SphereGeometry(0.035, 8, 6), '#ffffff'),
  ]));
