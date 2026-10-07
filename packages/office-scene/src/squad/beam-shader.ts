// The squad beam: one wide, soft funnel of additive light from a zone up into the elevator core. A single instanced tube
// whose centre line is a quadratic Bezier evaluated in the vertex shader from per-instance start, end and width, so every
// squad's beam is one draw call. Shader program 2 of the squad layer's four.
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  PointsMaterial,
  ShaderMaterial,
  Uint16BufferAttribute,
} from 'three';

const SEGMENTS = 48;
const SIDES = 16;
/** The beam's width where it enters the core's glass (the core's radius is 1.5). */
export const CORE_WIDTH = 1.2;
/** Heights the beam runs between, over the floor: above the crosses, under the ceiling rails. */
export const BEAM_FROM_Y = 2.6;
export const BEAM_TO_Y = 4.6;
export const BEAM_CAPACITY = 16;

const vertexShader = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec4 aMeta;   // zone width, brightness 0..1, amber 0..1, band phase
  attribute vec3 aTone;
  varying float vT;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec4 vMeta;
  varying vec3 vTone;
  void main() {
    float t = uv.y;
    float angle = uv.x * 6.2831853;
    vec3 control = mix(aStart, aEnd, 0.35) + vec3(0.0, 1.8, 0.0);
    float s = 1.0 - t;
    vec3 centre = s * s * aStart + 2.0 * s * t * control + t * t * aEnd;
    vec3 tangent = normalize(2.0 * s * (control - aStart) + 2.0 * t * (aEnd - control));
    vec3 ref = abs(tangent.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 side = normalize(cross(tangent, ref));
    vec3 up = cross(side, tangent);
    vec3 dir = cos(angle) * up + sin(angle) * side;
    float radius = mix(aMeta.x, ${CORE_WIDTH.toFixed(2)}, smoothstep(0.0, 1.0, t));
    vec3 world = centre + dir * radius;
    vNormal = dir;
    vView = cameraPosition - world;
    vT = t;
    vMeta = aMeta;
    vTone = aTone;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform float uPulse;   // the amber breathing, 0..1 (a constant when motion is reduced)
  varying float vT;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec4 vMeta;
  varying vec3 vTone;
  void main() {
    float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    float band = smoothstep(0.5, 1.0, 0.5 + 0.5 * sin((vT * 6.0 - vMeta.w) * 6.2831853));
    float fade = smoothstep(0.0, 0.12, vT) * smoothstep(1.0, 0.88, vT);
    float level = vMeta.y;
    float near = smoothstep(1.5, 7.0, length(vView)); // a beam the camera stands in is not drawn over the picture
    float alpha = (0.12 + 0.43 * level) * fade * near * (0.25 + 0.75 * edge + 0.45 * band * level);
    vec3 tone = mix(vTone, vec3(1.0), level * 0.5);
    tone = mix(tone, vec3(1.0, 0.78, 0.36), vMeta.z * uPulse);
    gl_FragColor = vec4(tone, alpha);
  }`;

/** The tube (uv.x round it, uv.y along it) with an instanced start, end, meta and tone per squad, and its material. */
export function createBeam() {
  const verts = (SEGMENTS + 1) * (SIDES + 1);
  const uv = new Float32Array(verts * 2);
  const index: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++)
    for (let j = 0; j <= SIDES; j++) {
      const v = i * (SIDES + 1) + j;
      uv[v * 2] = j / SIDES;
      uv[v * 2 + 1] = i / SEGMENTS;
      if (i < SEGMENTS && j < SIDES) {
        const a = v;
        const b = v + SIDES + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(verts * 3), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(new Uint16BufferAttribute(index, 1));
  const start = new InstancedBufferAttribute(new Float32Array(BEAM_CAPACITY * 3), 3);
  const end = new InstancedBufferAttribute(new Float32Array(BEAM_CAPACITY * 3), 3);
  const meta = new InstancedBufferAttribute(new Float32Array(BEAM_CAPACITY * 4), 4);
  const tone = new InstancedBufferAttribute(new Float32Array(BEAM_CAPACITY * 3), 3);
  geometry.setAttribute('aStart', start);
  geometry.setAttribute('aEnd', end);
  geometry.setAttribute('aMeta', meta);
  geometry.setAttribute('aTone', tone);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uPulse: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  return { geometry, material, start, end, meta, tone };
}

/** The drifting points from the core to a supervisor's halo (one shared `Points`). */
export const createDotMaterial = () =>
  new PointsMaterial({
    size: 0.09,
    color: '#ffffff',
    transparent: true,
    opacity: 0.8,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
