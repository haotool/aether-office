import { AdditiveBlending } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { SEGMENT_CAPACITY } from './rig.js';

/** Thin and soft: 1.4 CSS pixels, additive, so a string reads as a thread of light and never as a dark cord. */
export const STRING_WIDTH = 1.4;

/** Every string of the scene as one `LineSegments2` (one draw), with room for the most strings the rig holds. */
export function createStringLines() {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(SEGMENT_CAPACITY * 6));
  geometry.setColors(new Float32Array(SEGMENT_CAPACITY * 6));
  geometry.instanceCount = 0;
  const material = new LineMaterial({
    linewidth: STRING_WIDTH,
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  return { lines, material, geometry };
}
