import * as THREE from 'three';
import { DITHER_END, DITHER_PARS } from './dither.js';
import type { Stalk, Strand } from './stalk-types.js';
import { itemAt, lastOf } from './checked.js';

const TAPER = 3; // metres over which a strand swells from its end to full thickness
const MEETING = 0.5; // how thick a strand still is where it meets another one

/** The rings of one strand: a tube about its centerline, thinning towards a loose end and where it meets a fork or merge. */
function rings(strand: Strand, sides: number, skip: number) {
  const points = strand.points.filter((_, i, all) => i % skip === 0 || i === all.length - 1);
  const along = points.map((p) => new THREE.Vector3(...p));
  const length = [0];
  for (let i = 1; i < along.length; i++)
    length.push(lastOf(length) + itemAt(along, i).distanceTo(itemAt(along, i - 1)));
  const total = lastOf(length);
  const swell = (distance: number, loose: boolean) =>
    (loose ? 0.1 : MEETING) +
    (loose ? 0.9 : 1 - MEETING) * THREE.MathUtils.smoothstep(distance, 0, TAPER);
  // Parallel transport: the first ring's normal is any one square to the path, each next one is turned only as far as the path turns.
  let normal = new THREE.Vector3(1, 0, 0);
  return along.map((p, i) => {
    const tangent = itemAt(along, Math.min(i + 1, along.length - 1))
      .clone()
      .sub(itemAt(along, Math.max(i - 1, 0)))
      .normalize();
    normal = normal.clone().addScaledVector(tangent, -normal.dot(tangent)).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal);
    const here = itemAt(length, i);
    const scale =
      strand.radius * Math.min(swell(here, strand.free[0]), swell(total - here, strand.free[1]));
    return { p, normal, binormal, scale, sides };
  });
}

/**
 * One merged tube for every strand, each vertex carrying its colour and a seed that offsets the strand's energy pulses
 * from the others'. On `low` quality a tube has fewer sides and uses every other point of its path.
 */
export function stalkTubes(stalk: Stalk, low: boolean): THREE.BufferGeometry | null {
  const sides = low ? 5 : 8;
  const position: number[] = [];
  const normals: number[] = [];
  const tint: number[] = [];
  const seed: number[] = [];
  const index: number[] = [];
  const color = new THREE.Color();
  stalk.strands.forEach((strand, k) => {
    if (strand.points.length < 2) return;
    color.set(strand.color);
    const list = rings(strand, sides, low ? 2 : 1);
    const first = position.length / 3;
    list.forEach(({ p, normal, binormal, scale }, i) => {
      for (let s = 0; s < sides; s++) {
        const angle = (2 * Math.PI * s) / sides;
        const out = normal
          .clone()
          .multiplyScalar(Math.cos(angle))
          .addScaledVector(binormal, Math.sin(angle));
        position.push(p.x + out.x * scale, p.y + out.y * scale, p.z + out.z * scale);
        normals.push(out.x, out.y, out.z);
        tint.push(color.r, color.g, color.b);
        seed.push(k * 0.37);
        if (i < list.length - 1) {
          const a = first + i * sides + s;
          const b = first + i * sides + ((s + 1) % sides);
          index.push(a, b, a + sides, b, b + sides, a + sides);
        }
      }
    });
  });
  if (!position.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  geometry.setIndex(index);
  return geometry;
}

const STALK_VERTEX = `
      attribute vec3 tint;
      attribute float seed;
      varying vec3 vTint;
      varying float vSeed;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        vTint = tint;
        vSeed = seed;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;

const STALK_FRAGMENT = `
      ${DITHER_PARS}
      uniform float time;
      uniform float grow;
      uniform float energy;
      varying vec3 vTint;
      varying float vSeed;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        if (vWorld.y > grow) discard;
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(1.0 - facing, 2.2);
        float vein = pow(facing, 14.0);
        float band = fract(vWorld.y * 0.045 - time * (0.12 + 0.3 * energy) + vSeed);
        float pulse = smoothstep(0.0, 0.025, band) * smoothstep(0.1, 0.025, band);
        float shift = 0.5 + 0.5 * sin(vWorld.y * 0.31 + vSeed * 9.0 + time * 0.4);
        vec3 refracted = mix(vTint, vTint.zxy, 0.22 * shift);
        float tip = smoothstep(grow - 1.5, grow, vWorld.y);
        vec3 color = vTint * (0.12 + 0.6 * rim)
          + refracted * vein * (0.7 + 1.2 * pulse * (0.5 + energy))
          + vec3(1.0) * (pulse * vein * 0.5 + tip);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        ${DITHER_END}
      }`;

/**
 * The strands' glass, faked without a transmission pass: a body that is nearly clear, a rim that burns at grazing angles
 * (fresnel), a vein of light down the middle that a viewer looks straight through, a faint shift of hue as if refracted, and
 * pulses running up the vein. Additive and depth-free, so entwined strands add up instead of hiding each other. Cut off
 * above `grow` (the growing tip burns white).
 */
export function stalkMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, grow: { value: 0 }, energy: { value: 0 } },
    vertexShader: STALK_VERTEX,
    fragmentShader: STALK_FRAGMENT,
    dithering: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
