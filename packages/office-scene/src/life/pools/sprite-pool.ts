import {
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three';
import { CELLS, type PlacedSprite } from '../effects/types.js';
import { ATLAS_COLUMNS, ATLAS_ROWS, drawAtlas } from './atlas-art.js';

/** Live sprites the pool holds at once; what an effect adds beyond this is dropped, never queued. */
export const POOL_CAPACITY = 128;

const VERTEX = `
  attribute vec4 aPlace; // x y z size
  attribute vec4 aLook;  // cell rot flat alpha
  attribute vec3 aTint;
  uniform float columns;
  uniform float rows;
  varying vec2 vUv;
  varying vec4 vLook;
  varying vec3 vTint;
  void main() {
    float col = mod(aLook.x, columns);
    float row = floor(aLook.x / columns);
    vUv = vec2((col + uv.x) / columns, 1.0 - (row + 1.0 - uv.y) / rows);
    vLook = aLook;
    vTint = aTint;
    float c = cos(aLook.y);
    float s = sin(aLook.y);
    vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * aPlace.w;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = aPlace.xyz + (aLook.z > 0.5 ? vec3(p.x, 0.0, -p.y) : right * p.x + up * p.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;
const FRAGMENT = `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vLook;
  varying vec3 vTint;
  void main() {
    vec4 texel = texture2D(map, vUv);
    gl_FragColor = vec4(texel.rgb * vTint, texel.a * vLook.w);
    #include <colorspace_fragment>
  }`;

function atlasTexture() {
  const canvas = document.createElement('canvas');
  drawAtlas(canvas);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function instancedQuads() {
  const quad = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  const place = new InstancedBufferAttribute(new Float32Array(POOL_CAPACITY * 4), 4);
  const look = new InstancedBufferAttribute(new Float32Array(POOL_CAPACITY * 4), 4);
  const tint = new InstancedBufferAttribute(new Float32Array(POOL_CAPACITY * 3), 3);
  for (const attribute of [place, look, tint]) attribute.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aPlace', place);
  geometry.setAttribute('aLook', look);
  geometry.setAttribute('aTint', tint);
  geometry.instanceCount = 0;
  return { quad, geometry, place, look, tint };
}

export function createSpritePool() {
  const texture = atlasTexture();
  const { quad, geometry, place, look, tint } = instancedQuads();
  const material = new ShaderMaterial({
    uniforms: {
      map: { value: texture },
      columns: { value: ATLAS_COLUMNS },
      rows: { value: ATLAS_ROWS },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;

  return {
    mesh,
    write(sprites: readonly PlacedSprite[]): number {
      const count = Math.min(sprites.length, POOL_CAPACITY);
      for (let i = 0; i < count; i += 1) {
        const s = sprites[i];
        if (!s) break;
        place.setXYZW(i, s.x, s.y, s.z, s.size);
        look.setXYZW(i, CELLS.indexOf(s.cell), s.rot, s.flat ? 1 : 0, s.alpha);
        tint.setXYZ(i, s.tint[0], s.tint[1], s.tint[2]);
      }
      geometry.instanceCount = count;
      place.needsUpdate = look.needsUpdate = tint.needsUpdate = true;
      return count;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      quad.dispose();
    },
  };
}
