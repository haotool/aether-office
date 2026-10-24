import { describe, expect, it } from 'vitest';
import * as THREE from '../../packages/office-scene/node_modules/three/build/three.module.js';
import { estimateGpuBytes } from '../../packages/office-scene/src/perf/perf-rig.js';
import { Glide } from '../../packages/office-scene/src/squad/squad-glide.js';

describe('Glide', () => {
  it('starts a new key at its target and eases an old one toward it without overshooting', () => {
    const glide = new Glide();
    expect(glide.to('a', { x: 0, z: 0 }, 0.016, 0.2)).toEqual({ x: 0, z: 0 });
    let last = 0;
    for (let i = 0; i < 20; i++) {
      glide.begin();
      const at = glide.to('a', { x: 10, z: -4 }, 0.05, 0.2);
      expect(at.x).toBeGreaterThanOrEqual(last);
      expect(at.x).toBeLessThanOrEqual(10);
      expect(glide.moving).toBe(true);
      last = at.x;
    }
  });

  it('settles exactly on the target, then reports that nothing moves', () => {
    const glide = new Glide();
    glide.to('a', { x: 0, z: 0 }, 0.016, 0.1);
    let at = { x: 0, z: 0 };
    for (let i = 0; i < 200; i++) {
      glide.begin();
      at = glide.to('a', { x: 3, z: 3 }, 0.1, 0.1);
    }
    expect(at).toEqual({ x: 3, z: 3 });
    expect(glide.moving).toBe(false);
  });

  it('jumps straight to the target when the time constant is zero', () => {
    const glide = new Glide();
    glide.to('a', { x: 0, z: 0 }, 0.016, 1);
    expect(glide.to('a', { x: 5, z: 6 }, 0.016, 0)).toEqual({ x: 5, z: 6 });
  });

  it('forgets what is no longer kept, so it returns afresh', () => {
    const glide = new Glide();
    glide.to('a', { x: 0, z: 0 }, 0.016, 1);
    glide.to('b', { x: 0, z: 0 }, 0.016, 1);
    glide.prune(new Set(['b']));
    expect(glide.to('a', { x: 9, z: 9 }, 0.016, 1)).toEqual({ x: 9, z: 9 });
    expect(glide.to('b', { x: 9, z: 9 }, 0.016, 1)).not.toEqual({ x: 9, z: 9 });
  });
});

describe('estimateGpuBytes', () => {
  it('counts a geometry’s attributes once however many meshes share it', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const alone = new THREE.Scene();
    alone.add(new THREE.Mesh(geometry, material));
    const shared = new THREE.Scene();
    shared.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    expect(estimateGpuBytes(shared, 0)).toBe(estimateGpuBytes(alone, 0));
    expect(estimateGpuBytes(alone, 0)).toBeGreaterThan(0);
  });

  it('adds the drawing buffer, colour and depth', () => {
    const empty = new THREE.Scene();
    expect(estimateGpuBytes(empty, 1000)).toBe(1000 * 4 * 2);
  });

  it('counts a texture with its mip chain and a shadow map twice, for its blur target', () => {
    const texture = new THREE.Texture({ width: 64, height: 64 } as never);
    texture.generateMipmaps = true;
    const withTexture = new THREE.Scene();
    withTexture.add(
      new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: texture })),
    );
    expect(estimateGpuBytes(withTexture, 0)).toBeCloseTo(64 * 64 * 4 * (4 / 3), 0);
    texture.generateMipmaps = false;
    expect(estimateGpuBytes(withTexture, 0)).toBe(64 * 64 * 4);
    const light = new THREE.DirectionalLight();
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    const lit = new THREE.Scene();
    lit.add(light);
    expect(estimateGpuBytes(lit, 0)).toBe(512 * 512 * 4 * 2);
  });

  it('ignores a texture with no image yet', () => {
    const scene = new THREE.Scene();
    scene.add(
      new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({ map: new THREE.Texture() }),
      ),
    );
    expect(estimateGpuBytes(scene, 0)).toBe(0);
  });
});
