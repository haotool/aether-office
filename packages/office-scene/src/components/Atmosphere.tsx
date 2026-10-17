import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial } from 'three';
import { AIR, hourOf, tintAt, type AirQuality } from '../environment/air.js';
import { seeded } from '../environment/seeded.js';
import { setUniform } from '../environment/uniforms.js';

const HALF_W = 24;
const HALF_D = 16;
const CEILING = 5.4;

const tint = () => new Color(...tintAt(hourOf(new Date())));

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
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(({ clock, size, gl }) => {
    setUniform(material, 'time', animate ? clock.elapsedTime : 0);
    setUniform(material, 'scale', size.height * gl.getPixelRatio() * 0.9);
  });
  if (count === 0) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
