import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedBufferAttribute, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { DITHER_END, DITHER_PARS, DITHERED } from './dither.js';
import { seeded } from './seeded.js';
import { setUniform } from './uniforms.js';

const COUNT = 44;
const noRaycast = () => null;

function cloudSprites() {
  const random = seeded('aether-clouds');
  const cloud = new Float32Array(COUNT * 4); // radius, angle, height about the tip, drift (radians per second)
  const look = new Float32Array(COUNT * 2); // size, seed
  for (let i = 0; i < COUNT; i++) {
    cloud.set(
      [
        3 + 22 * Math.sqrt(random()),
        2 * Math.PI * random(),
        -12 + 22 * random(),
        0.01 + 0.025 * random(),
      ],
      i * 4,
    );
    look.set([8 + 9 * random(), random()], i * 2);
  }
  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute('cloud', new InstancedBufferAttribute(cloud, 4));
  geometry.setAttribute('look', new InstancedBufferAttribute(look, 2));
  return geometry;
}

const CLOUD_VERTEX = `
      attribute vec4 cloud;
      attribute vec2 look;
      uniform float time;
      uniform vec3 tip;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float angle = cloud.y + time * cloud.w;
        vec3 center = tip + vec3(cos(angle) * cloud.x, cloud.z + sin(time * 0.2 + look.y * 6.0) * 0.6, sin(angle) * cloud.x);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 world = center + (right * position.x + up * position.y) * look.x;
        vUv = position.xy * 2.0;
        vSeed = look.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`;

const CLOUD_FRAGMENT = `
      ${DITHER_PARS}
      uniform float opacity;
      uniform vec3 tint;
      varying vec2 vUv;
      varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float d = length(vUv);
        float body = smoothstep(1.0, 0.2, d);
        vec2 p = vUv * 1.7 + vSeed * 31.0;
        float lump = 0.55 * noise(p) + 0.3 * noise(p * 2.1) + 0.15 * noise(p * 4.3);
        float alpha = body * smoothstep(0.2, 0.75, lump + body * 0.35) * 0.42 * opacity;
        float low = 0.5 - 0.5 * vUv.y;
        vec3 color = mix(vec3(0.46, 0.58, 0.7), vec3(0.8, 0.88, 0.95), 0.5 + 0.5 * vUv.y);
        color = mix(color, tint * 1.1, 0.3 * low * body);
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
        ${DITHER_END}
      }`;

const cloudMaterial = () =>
  new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      opacity: { value: 1 },
      tip: { value: new Vector3() },
      tint: { value: new Color() },
    },
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    ...DITHERED,
    transparent: true,
    depthWrite: false,
  });

/**
 * A bank of soft clouds round the spire's tip, one instanced draw: each a camera-facing quad shaded with a few octaves of
 * noise (lumpy edge, pale top, the crown's colour on its underside), drifting slowly round the axis. Not shown on low quality.
 * `shown` (0 to 1) fades them in once the crown is built.
 */
export function Clouds({
  top,
  tint,
  animate,
  shown,
}: {
  top: number;
  tint: string;
  animate: boolean;
  shown: { current: number };
}) {
  const geometry = useMemo(cloudSprites, []);
  const material = useMemo(cloudMaterial, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((state) => {
    setUniform(material, 'time', animate ? state.clock.elapsedTime : 0);
    setUniform(material, 'opacity', shown.current);
    material.uniforms['tip']?.value.set(0, top, 0);
    material.uniforms['tint']?.value.set(tint);
  });
  return (
    <instancedMesh
      args={[geometry, material, COUNT]}
      frustumCulled={false}
      raycast={noRaycast}
      renderOrder={2}
    />
  );
}
