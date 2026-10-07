import * as THREE from 'three';
import { DITHER_END, DITHER_PARS, DITHERED } from './dither.js';

/** Materials of a floor: the department-tinted hull, glass and glow, and the holographic surfaces. */
export type Materials = ReturnType<typeof createMaterials>;

export const glow = (
  color: string,
  intensity: number,
  extra: THREE.MeshStandardMaterialParameters = {},
) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.2,
    ...extra,
  });

/** A holographic surface: additive, see-through, never writes depth, so overlapping layers shine rather than occlude. */
export const holo = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

/**
 * A hologram: additive light that is brighter at grazing angles (fresnel), crossed by moving scanlines and a slow flicker.
 * One instance per floor; its `time` uniform is advanced by the scene.
 */
function hologram(color: string, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(color) },
      strength: { value: strength },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      ${DITHER_PARS}
      uniform float time;
      uniform vec3 color;
      uniform float strength;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vView)), 1.6);
        float scan = 0.55 + 0.45 * sin(vWorld.y * 90.0 - time * 3.0);
        float band = smoothstep(0.92, 1.0, sin(vWorld.y * 3.0 - time * 1.4));
        float flicker = 0.92 + 0.08 * sin(time * 17.0 + vWorld.x * 3.0);
        float alpha = (0.18 + 0.55 * fresnel) * scan * flicker + band * 0.25;
        gl_FragColor = vec4(color * (0.7 + fresnel), alpha * strength);
        ${DITHER_END}
      }`,
    ...DITHERED,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createMaterials(accent: string) {
  return {
    hull: new THREE.MeshStandardMaterial({ color: '#070f16', metalness: 0.85, roughness: 0.3 }),
    slab: new THREE.MeshStandardMaterial({ color: '#0d1c27', metalness: 0.7, roughness: 0.32 }),
    deck: new THREE.MeshStandardMaterial({ color: '#1b4656', metalness: 0.45, roughness: 0.3 }),
    panel: new THREE.MeshStandardMaterial({ color: '#27576a', metalness: 0.4, roughness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: '#dfe9ec', roughness: 0.4, metalness: 0.25 }),
    graphite: new THREE.MeshStandardMaterial({ color: '#16242d', roughness: 0.42, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#7e929c', roughness: 0.3, metalness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8d6f55', roughness: 0.7 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#2f5a63', roughness: 0.95 }),
    green: new THREE.MeshStandardMaterial({ color: '#2f7a58', roughness: 0.85 }),
    darkgreen: new THREE.MeshStandardMaterial({ color: '#1d4a3e', roughness: 0.9 }),
    accent: glow(accent, 1.3),
    accentSoft: glow(accent, 0.55),
    cyan: glow('#5ee7e7', 1.1),
    amber: glow('#ffb454', 1.0),
    red: glow('#ff6b6b', 0.9),
    screen: glow('#0d3a48', 0.9, { color: '#0a2630' }),
    screenBright: glow(accent, 0.8, { color: '#10333f' }),
    glass: new THREE.MeshStandardMaterial({
      color: '#8fd3dc',
      transparent: true,
      opacity: 0.14,
      roughness: 0.15,
      metalness: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    holo: holo(accent, 0.2),
    holoStrong: holo(accent, 0.42),
    holoCyan: holo('#5ee7e7', 0.22),
    hologram: hologram(accent),
    hologramCyan: hologram('#5ee7e7', 0.8),
    shell: new THREE.MeshStandardMaterial({ color: '#e7eef2', roughness: 0.25, metalness: 0.35 }),
  };
}
