import * as THREE from 'three';
import { DITHER_END, DITHER_PARS } from './dither.js';

/** Flowers the shader can open independently: a tier's each (up to 12), the great bloom's and a merge's each (up to 16). */
export const MAX_FLOWERS = 32;

const SHARED_VERTEX = `
  uniform float time;
  uniform float open[${MAX_FLOWERS}];
`;

const GARDEN_VERTEX = `
      ${SHARED_VERTEX}
      attribute vec3 hinge;
      attribute vec3 axis;
      attribute vec4 pose;
      attribute vec4 look;
      attribute vec4 tintA;
      attribute vec3 tintB;
      varying vec4 vTintA;
      varying vec3 vTintB;
      varying vec4 vLook;
      varying float vKind;
      varying float vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      vec3 turn(vec3 v, vec3 k, float a) {
        float c = cos(a);
        float s = sin(a);
        return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
      }
      void main() {
        float opened = open[int(pose.z + 0.5)];
        float local = clamp((opened - pose.y * 0.55) / 0.45, 0.0, 1.0);
        // Eases in and out, runs a little past the final angle near the end, then settles.
        float back = smoothstep(0.0, 1.0, local) + 0.2 * sin(3.14159 * local * local * local);
        float angle = pose.x * (1.0 - back) + 0.05 * sin(time * 0.8 + pose.z * 2.0) * local * step(0.001, pose.x);
        vec3 rel = position - hinge;
        vec3 n = normal;
        if (pose.w < 0.5) {
          rel = turn(rel, axis, angle);
          n = turn(n, axis, angle);
        }
        vec3 p = hinge + rel * smoothstep(0.0, 0.3, local);
        p += vec3(sin(time * 0.7 + pose.z * 1.3), 0.15 * sin(time * 0.9 + pose.z), cos(time * 0.6 + pose.z * 2.1)) * look.w * 0.35 * local;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * n);
        vView = normalize(cameraPosition - world.xyz);
        vTintA = tintA;
        vTintB = tintB;
        vLook = look;
        vKind = pose.w;
        vLocal = local;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`;

const GARDEN_FRAGMENT = `
      ${DITHER_PARS}
      uniform float time;
      varying vec4 vTintA;
      varying vec3 vTintB;
      varying vec4 vLook;
      varying float vKind;
      varying float vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        if (vLocal <= 0.002) discard;
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(1.0 - facing, 2.2);
        vec3 color;
        float alpha = 0.0;
        if (vKind < 0.5) {
          float u = vLook.x;
          float v = vLook.y;
          float glass = vLook.z;
          float detail = vTintA.w;
          vec3 base = mix(vTintA.rgb, vTintB, smoothstep(0.0, 1.0, u));
          float fan = abs(sin(v / (0.25 + 0.75 * (1.0 - 0.5 * u)) * (2.0 + 5.0 * detail) * 3.14159));
          float vein = pow(1.0 - fan, 10.0) * smoothstep(0.02, 0.2, u) * (1.0 - 0.4 * u);
          float cross = pow(1.0 - abs(sin(u * 26.0 + abs(v) * 9.0)), 16.0) * 0.35 * detail;
          float mid = exp(-v * v * 36.0) * (1.0 - 0.7 * u);
          float pulse = 0.8 + 0.2 * sin(time * 1.6 - u * 6.0 + vWorld.y * 0.3);
          vec3 iridescent = 0.5 + 0.5 * cos(6.28318 * (facing * 0.8 + u * 0.5 + vec3(0.0, 0.33, 0.67)));
          float edge = rim + smoothstep(0.78, 1.0, abs(v)) * 0.5;
          float through = (1.0 - facing) * (0.4 + 0.6 * (1.0 - u)) * glass;
          alpha = mix(0.95, 0.65, glass);
          vec3 body = base * (0.4 + 0.35 * smoothstep(0.0, 0.5, u)) * (0.55 + 0.45 * facing);
          vec3 emit = base * rim * (0.12 + 0.35 * glass)
            + vTintB * (0.4 + 1.2 * iridescent) * edge * (0.07 + 0.15 * glass)
            + base * (vein + cross + mid * 0.5) * (0.22 + 0.4 * detail) * pulse
            + vTintB * through * 0.3
            + vTintB * smoothstep(0.75, 1.0, u) * (0.06 + 0.14 * glass);
          color = body * alpha + emit;
        } else if (vKind < 2.0) {
          float vein = pow(facing, 14.0);
          float pulse = pow(0.5 + 0.5 * sin(time * 2.0 - vLook.x * 5.0), 6.0);
          color = vTintA.rgb * (0.12 + 0.6 * rim) + vTintB * vein * (0.5 + 1.1 * pulse) * vTintA.w;
        } else {
          float g = smoothstep(1.0, 0.0, length(vLook.xy));
          g *= g;
          color = mix(vTintA.rgb, vTintB, 0.25) * g * 1.4 * vTintA.w * (0.85 + 0.15 * sin(time * 2.4 + vWorld.x + vWorld.z));
        }
        gl_FragColor = vec4(alpha > 0.0 ? min(color, vec3(1.0)) : 1.0 - exp(-color * 2.2), alpha);
        #include <colorspace_fragment>
        ${DITHER_END}
      }`;

/**
 * The garden's skin. One vertex shader opens every flower: a part's `pose` holds how far it swings and how late in the bloom it
 * comes (so the petals open one after another, outer whorl first, with a little overshoot), then a slow breathing sway.
 * The fragment shader paints by kind: a petal is a gradient from the branch hue to a shifted tip with a fan of glowing veins,
 * a fresnel rim with an iridescent edge and a fake of light shining through (translucency grows with `glass`), and it hides
 * what is behind it a little so a flower reads against the bright glass of the crown; a tube is the strands' glass; a glow is a
 * soft additive spot (florets, bead tips, rings). No textures, no lights, no transmission pass.
 */
export function gardenMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, open: { value: new Array<number>(MAX_FLOWERS).fill(0) } },
    vertexShader: GARDEN_VERTEX,
    fragmentShader: GARDEN_FRAGMENT,
    dithering: true,
    transparent: true,
    depthWrite: false,
    // Premultiplied: a petal (alpha above 0) hides what is behind it, light (alpha 0) simply adds.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  });
}

/** Pollen orbiting a flower and spores rising past it, as soft additive points that appear once the flower is open. */
export function pollenMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      open: { value: new Array<number>(MAX_FLOWERS).fill(0) },
      scale: { value: 800 },
    },
    vertexShader: `
      ${SHARED_VERTEX}
      uniform float scale;
      attribute vec4 orbit;
      attribute vec3 axis;
      attribute vec4 meta;
      attribute vec3 tint;
      varying vec3 vTint;
      varying float vFade;
      void main() {
        vec3 w = normalize(axis);
        vec3 u = normalize(cross(w, abs(w.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
        vec3 v = cross(w, u);
        float a = orbit.y + time * orbit.z;
        float ring = orbit.x * (meta.y > 0.5 ? 0.6 : 1.0);
        float climb = meta.y > 0.5 ? fract(time * 0.08 + orbit.w) : 0.0;
        float lift = meta.y > 0.5 ? climb * meta.w * 1.8 : (sin(time * 0.8 + orbit.y * 3.0) * 0.2 + orbit.w - 0.3) * meta.w * 0.5;
        vec3 p = position + (u * cos(a) + v * sin(a)) * ring + w * lift;
        vFade = smoothstep(0.7, 1.0, open[int(meta.x + 0.5)]) * (meta.y > 0.5 ? sin(climb * 3.14159) : 0.6 + 0.4 * sin(time * 2.0 + orbit.y * 5.0));
        vTint = tint;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.5, meta.z * scale / -view.z);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      ${DITHER_PARS}
      varying vec3 vTint;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(vTint * a * a * vFade * 1.6, 1.0);
        #include <colorspace_fragment>
        ${DITHER_END}
      }`,
    dithering: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
