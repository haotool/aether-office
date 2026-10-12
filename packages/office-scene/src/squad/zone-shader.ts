import {
  AdditiveBlending,
  DoubleSide,
  InstancedBufferAttribute,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { DITHER_END, DITHER_PARS, DITHERED } from '../environment/dither.js';

const vertexShader = /* glsl */ `
  attribute vec2 aSize;
  attribute vec3 aTone;
  attribute float aAlpha;
  varying vec2 vLocal;
  varying vec2 vSize;
  varying vec3 vTone;
  varying float vAlpha;
  void main() {
    vSize = aSize;
    vTone = aTone;
    vAlpha = aAlpha;
    vLocal = position.xz * aSize;
    vec4 world = modelMatrix * instanceMatrix * vec4(vLocal.x, 0.0, vLocal.y, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const fragmentShader = /* glsl */ `
  ${DITHER_PARS}
  varying vec2 vLocal;
  varying vec2 vSize;
  varying vec3 vTone;
  varying float vAlpha;
  float roundBox(vec2 p, vec2 box, float r) {
    vec2 q = abs(p) - box + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float d = roundBox(vLocal, vSize * 0.5 - 0.06, 0.3);
    float line = 1.0 - smoothstep(0.0, 0.04, abs(d));
    float dash = step(0.4, fract((vLocal.x + vLocal.y) * 1.4));
    float fill = (1.0 - smoothstep(-0.7, 0.0, d)) * step(d, 0.0);
    float alpha = (line * mix(0.35, 0.85, dash) + fill * 0.1) * vAlpha;
    gl_FragColor = vec4(vTone, alpha);
    ${DITHER_END}
  }`;

export const ZONE_CAPACITY = 16;

export function createZoneDecal() {
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const size = new InstancedBufferAttribute(new Float32Array(ZONE_CAPACITY * 2), 2);
  const tone = new InstancedBufferAttribute(new Float32Array(ZONE_CAPACITY * 3), 3);
  const alpha = new InstancedBufferAttribute(new Float32Array(ZONE_CAPACITY), 1);
  geometry.setAttribute('aSize', size);
  geometry.setAttribute('aTone', tone);
  geometry.setAttribute('aAlpha', alpha);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    ...DITHERED,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return { geometry, material, size, tone, alpha };
}
