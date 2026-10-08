import { describe, expect, it } from 'vitest';
import * as THREE from '../../packages/office-scene/node_modules/three/build/three.module.js';
import type { Seat } from '../../packages/office-scene/src/environment/director.js';
import { lifeContext } from '../../packages/office-scene/src/life/context.js';
import {
  SPOT,
  clamp01,
  draw,
  envelope,
  lerp,
} from '../../packages/office-scene/src/life/effects/shared.js';
import { estimateGpuBytes } from '../../packages/office-scene/src/perf/perf-rig.js';
import { stringsEnabled } from '../../packages/office-scene/src/squad/puppet/policy.js';
import { crossGeometry } from '../../packages/office-scene/src/squad/puppet/puppet-art.js';
import { SEGMENT_CAPACITY } from '../../packages/office-scene/src/squad/puppet/rig.js';
import {
  STRING_WIDTH,
  createStringLines,
} from '../../packages/office-scene/src/squad/puppet/string-lines.js';
import { Glide } from '../../packages/office-scene/src/squad/squad-glide.js';

describe('stringsEnabled', () => {
  it('draws the puppet strings on the balanced and high tiers unless the person turned them off', () => {
    expect(stringsEnabled('balanced', undefined)).toBe(true);
    expect(stringsEnabled('high', {})).toBe(true);
    expect(stringsEnabled('high', { relation: true, strings: true })).toBe(true);
  });

  it('never draws them on the low tier, nor when the relation effects or the strings are off', () => {
    expect(stringsEnabled('low', {})).toBe(false);
    expect(stringsEnabled('high', { relation: false })).toBe(false);
    expect(stringsEnabled('high', { strings: false })).toBe(false);
    expect(stringsEnabled('low', { relation: false, strings: false })).toBe(false);
  });
});

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

describe('puppet parts', () => {
  it('shares one control-cross geometry in vertex colours', () => {
    const geometry = crossGeometry();
    expect(crossGeometry()).toBe(geometry);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0.34); // the bar plus the nodes at its ends
    expect(size.x).toBeLessThan(0.45);
    expect(size.y).toBeLessThan(0.1);
  });

  it('makes all strings one soft additive draw with room for every segment', () => {
    const { lines, material, geometry } = createStringLines();
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.linewidth).toBe(STRING_WIDTH);
    expect(material.depthWrite).toBe(false);
    expect(material.vertexColors).toBe(true);
    expect(geometry.instanceCount).toBe(0); // nothing drawn until the rig fills it
    expect(lines.frustumCulled).toBe(false);
    expect(SEGMENT_CAPACITY).toBeGreaterThan(0);
  });
});

describe('life effect helpers', () => {
  it('clamp01 and lerp', () => {
    expect([clamp01(-1), clamp01(0.4), clamp01(7)]).toEqual([0, 0.4, 1]);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('envelope rises, holds, falls, and is zero outside the effect', () => {
    expect(envelope(-1, 2000)).toBe(0);
    expect(envelope(2001, 2000)).toBe(0);
    expect(envelope(0, 2000)).toBe(0);
    expect(envelope(175, 2000)).toBeCloseTo(0.5);
    expect(envelope(1000, 2000)).toBe(1);
    expect(envelope(1825, 2000)).toBeCloseTo(0.5);
    expect(envelope(100, 400, 100)).toBe(1);
  });

  it('draw gives the same number for the same seed and step, and a different one otherwise', () => {
    expect(draw(7, 0)).toBe(draw(7, 0));
    expect(draw(7, 0)).not.toBe(draw(7, 1));
    expect(draw(7, 0)).not.toBe(draw(8, 0));
    for (let n = 0; n < 50; n++) expect(draw(3, n)).toBeGreaterThanOrEqual(0);
  });

  it('names the spots on and over a desk, all above the floor', () => {
    expect(Object.keys(SPOT).sort()).toEqual(['aboveScreen', 'deskRight', 'mug', 'overHead']);
    for (const [, y] of Object.values(SPOT)) expect(y).toBeGreaterThan(0.5);
  });
});

describe('lifeContext', () => {
  const seats = new Map<string, Seat>([
    ['a', { x: 1, z: 1, floor: 0, rotation: 0 }],
    ['b', { x: 2, z: 1, floor: 1, rotation: 0 }],
    ['c', { x: 3, z: 1, floor: 1, rotation: 0 }],
  ]);
  const context = (view = { floor: 1, exploded: false }, zh = false) =>
    lifeContext(seats, view, { names: { a: 'Ada' }, idle: ['a', 'b', 'c', 'ghost'] }, zh);

  it('answers which floor a member sits on, and nothing for an unknown one', () => {
    expect(context().floorOf('b')).toBe(1);
    expect(context().floorOf('ghost')).toBeNull();
  });

  it('sees a member only on the floor in view, or on every floor when the building is spread apart', () => {
    expect(context().visible('a')).toBe(false);
    expect(context().visible('b')).toBe(true);
    expect(context().visible('ghost')).toBe(false);
    expect(context({ floor: 1, exploded: true }).visible('a')).toBe(true);
  });

  it('lists the idle members of a floor, and names members by their title or their id', () => {
    expect(context().idleOn(1)).toEqual(['b', 'c']);
    expect(context().idleOn(4)).toEqual([]);
    expect(context().nameOf('a')).toBe('Ada');
    expect(context().nameOf('b')).toBe('b');
    expect(context({ floor: 0, exploded: false }, true).zh).toBe(true);
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
