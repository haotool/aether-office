import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  ShaderMaterial,
} from 'three';
import { DITHER_END, DITHER_PARS, DITHERED } from '../environment/dither.js';
import { AIR, hourOf, tintAt, type AirQuality } from '../environment/air.js';
import { seeded } from '../environment/seeded.js';
import { setUniform } from '../environment/uniforms.js';

// The room's air: slow dust motes and a few shafts of light from the rear windows. Each is one draw call, animated by its
// shader's clock (no per-frame work on the CPU beyond one uniform), tinted by the hour, drawn additively.

const HALF_W = 24;
const HALF_D = 16;
const CEILING = 5.4;
const WINDOW_Z = -18.2;
/** The window panels (x of their centres) a shaft may fall from, in the order they are used. */
const PANELS = [-15, 9, -3, 21, -21] as const;

const tint = () => new Color(...tintAt(hourOf(new Date())));

/** Frees an effect's geometry and material on the GPU when they are replaced or the effect goes. */
function useDisposed(geometry: BufferGeometry, material: ShaderMaterial) {
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
}

const MOTE_VERTEX = `
  attribute vec3 phase;
  uniform float time;
  uniform float scale;
  varying float vFade;
  void main() {
    vec3 p = position;
    p.x += sin(time * 0.09 + phase.x * 6.283) * 1.4;
    p.z += cos(time * 0.07 + phase.z * 6.283) * 1.1;
    p.y += sin(time * 0.15 + phase.y * 6.283) * 0.45;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp((0.09 + phase.y * 0.08) * scale / -mv.z, 1.5, 10.0);
    vFade = 0.35 + 0.65 * (0.5 + 0.5 * sin(time * 0.4 + phase.x * 12.0));
    gl_Position = projectionMatrix * mv;
  }`;
const MOTE_FRAGMENT = `
  uniform vec3 color;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, d)) * 0.85 * vFade;
    gl_FragColor = vec4(color, a);
  }`;

/** Dust motes drifting in the room's volume, tinted by the hour. */
export function DustMotes({ quality, animate }: { quality: AirQuality; animate: boolean }) {
  const count = AIR[quality].motes;
  const { geometry, material } = useMemo(() => {
    const random = seeded('dust');
    const base = new Float32Array(count * 3);
    const phase = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base.set(
        [
          (random() * 2 - 1) * HALF_W,
          0.6 + random() * (CEILING - 0.6),
          (random() * 2 - 1) * HALF_D,
        ],
        i * 3,
      );
      phase.set([random(), random(), random()], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(base, 3));
    g.setAttribute('phase', new BufferAttribute(phase, 3));
    g.boundingSphere = null;
    const m = new ShaderMaterial({
      uniforms: { time: { value: 0 }, scale: { value: 600 }, color: { value: tint() } },
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, [count]);
  useDisposed(geometry, material);
  useFrame(({ clock, size, gl }) => {
    setUniform(material, 'time', animate ? clock.elapsedTime : 0);
    setUniform(material, 'scale', size.height * gl.getPixelRatio() * 0.9);
  });
  if (count === 0) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

const SHAFT_VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SHAFT_FRAGMENT = `
  ${DITHER_PARS}
  uniform vec3 color;
  uniform float time;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.0);
    float along = 0.3 + 0.7 * pow(vUv.y, 1.2);
    float shimmer = 0.8 + 0.2 * sin(time * 0.5 + vUv.x * 7.0);
    gl_FragColor = vec4(color, 0.5 * across * along * shimmer);
    ${DITHER_END}
  }`;

/** A few soft shafts of light falling from the rear windows across the room, in one draw call. */
export function LightShafts({ quality, animate }: { quality: AirQuality; animate: boolean }) {
  const count = AIR[quality].shafts;
  const { geometry, material } = useMemo(() => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    PANELS.slice(0, count).forEach((x, i) => {
      // Top edge on the window panel, bottom edge splayed and shifted into the room, as sun through glass.
      const reach = 13 + (i % 3) * 2;
      const drift = 3 + i * 0.6;
      const quad = [
        [x - 2.2, CEILING - 0.2, WINDOW_Z + 0.1, 0, 1],
        [x + 2.2, CEILING - 0.2, WINDOW_Z + 0.1, 1, 1],
        [x + drift + 2.4, 0.08, WINDOW_Z + reach, 1, 0],
        [x + drift - 2.4, 0.08, WINDOW_Z + reach, 0, 0],
      ];
      const first = positions.length / 3;
      for (const [px = 0, py = 0, pz = 0, u = 0, v = 0] of quad) {
        positions.push(px, py, pz);
        uvs.push(u, v);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    g.setIndex(indices);
    const m = new ShaderMaterial({
      uniforms: { time: { value: 0 }, color: { value: tint() } },
      vertexShader: SHAFT_VERTEX,
      fragmentShader: SHAFT_FRAGMENT,
      ...DITHERED,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    return { geometry: g, material: m };
  }, [count]);
  useDisposed(geometry, material);
  useFrame(({ clock }) => {
    setUniform(material, 'time', animate ? clock.elapsedTime : 0);
  });
  if (count === 0) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
