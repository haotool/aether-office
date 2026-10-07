import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Layout } from '../../packages/contracts/src/index.js';
import * as THREE from '../../packages/office-scene/node_modules/three/build/three.module.js';
import { DomainError } from '../../packages/kernel/src/errors.js';
import { busiestFloor, floorCounts } from '../../packages/office-scene/src/floor-counts.js';
import { box, mergeStatic } from '../../packages/office-scene/src/geometry.js';
import { FLOORS } from '../../packages/office-scene/src/layout.js';
import { pickSpeakers } from '../../packages/office-scene/src/speakers.js';
import {
  domEvent,
  installBrowserEnv,
  removeBrowserEnv,
  type BrowserEnv,
} from './fixtures/browser-env.js';
import { renderHook } from './fixtures/mini-react.js';

const web = await vi.hoisted(async () => {
  const paths = await import('./fixtures/web-paths.js');
  return { react: paths.WEB_REACT };
});
vi.mock(web.react, () => import('./fixtures/mini-react.js'));
const { useSceneKeys } = await import('../../packages/office-scene/src/scene-keys.js');

const agent = (id: string, activity = 'idle'): Agent => ({ id, activity }) as Agent;
const layoutWith = (desks: Record<string, number>) =>
  ({
    schemaVersion: 2,
    zones: [],
    objects: Object.entries(desks).map(([agentId, floor]) => ({ agentId, floor })),
  }) as unknown as Layout;

describe('floorCounts and busiestFloor', () => {
  it('count members and the working or reviewing ones on the floor of their desk', () => {
    const counts = floorCounts(
      [agent('a', 'working'), agent('b', 'reviewing'), agent('c'), agent('d', 'working')],
      layoutWith({ a: 0, b: 0, c: 0, d: 2 }),
    );
    expect(counts).toHaveLength(FLOORS);
    expect(counts[0]).toEqual({ total: 3, working: 2 });
    expect(counts[2]).toEqual({ total: 1, working: 1 });
  });

  it('put a member without a desk on the ground floor and clamp a floor beyond the building', () => {
    const counts = floorCounts([agent('nodesk'), agent('high')], layoutWith({ high: 99 }));
    expect(counts[0]!.total).toBe(1);
    expect(counts[FLOORS - 1]!.total).toBe(1);
  });

  it('start on the floor with the most work, then the most members, and on none when empty', () => {
    expect(busiestFloor([])).toBeNull();
    expect(busiestFloor(Array.from({ length: 3 }, () => ({ total: 0, working: 0 })))).toBeNull();
    expect(
      busiestFloor([
        { total: 5, working: 0 },
        { total: 1, working: 1 },
        { total: 2, working: 1 },
      ]),
    ).toBe(2);
    expect(
      busiestFloor([
        { total: 2, working: 0 },
        { total: 4, working: 0 },
      ]),
    ).toBe(1);
  });
});

describe('pickSpeakers', () => {
  const speech = (...ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { prompt: 'p', reply: 'r' }])) as never;
  const input = (over: Record<string, unknown> = {}) => ({
    agents: [agent('a'), agent('b', 'working'), agent('c')],
    speech: speech('a', 'b', 'c'),
    intensity: undefined,
    selectedId: null,
    onShot: () => false,
    compact: false,
    ...over,
  });
  const ids = (over?: Record<string, unknown>) => pickSpeakers(input(over)).map((a) => a.id);

  it('gives a bubble to working members and leaves idle ones quiet', () => {
    expect(ids()).toEqual(['b']);
  });

  it('puts the selected member and the camera’s subjects first, even when idle', () => {
    expect(ids({ selectedId: 'c' })).toEqual(['c', 'b']);
    expect(ids({ onShot: (id: string) => id === 'a' })).toEqual(['a', 'b']);
  });

  it('on a phone speaks only for the selected member and the camera’s subjects', () => {
    expect(ids({ compact: true })).toEqual([]);
    expect(ids({ compact: true, selectedId: 'a' })).toEqual(['a']);
  });

  it('ranks by activity intensity and shows no more than six at once', () => {
    const many = Array.from({ length: 9 }, (_, i) => agent(`m${i}`));
    const picked = pickSpeakers(
      input({
        agents: many,
        speech: speech(...many.map((a) => a.id)),
        intensity: { m8: 3, m7: 2, m6: 1, m5: 1, m4: 1, m3: 1, m2: 1 },
      }),
    ).map((a) => a.id);
    expect(picked).toHaveLength(6);
    expect(picked.slice(0, 2)).toEqual(['m8', 'm7']);
  });

  it('skips members who have said nothing', () => {
    expect(ids({ speech: speech('a'), selectedId: 'b' })).toEqual([]);
    expect(ids({ speech: undefined })).toEqual([]);
  });
});

describe('geometry', () => {
  it('adds a shadow-casting rounded box at the requested place', () => {
    const group = new THREE.Group();
    const mesh = box(group, new THREE.MeshBasicMaterial(), [2, 1, 4], [1, 2, 3]);
    expect(group.children).toEqual([mesh]);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2);
    expect(size.y).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(4);
  });

  it('can bore a round shaft through the middle', () => {
    const solid = box(new THREE.Group(), new THREE.MeshBasicMaterial(), [4, 1, 4], [0, 0, 0]);
    const holed = box(
      new THREE.Group(),
      new THREE.MeshBasicMaterial(),
      [4, 1, 4],
      [0, 0, 0],
      0.03,
      0.5,
    );
    expect(holed.geometry.attributes['position']!.count).toBeGreaterThan(
      solid.geometry.attributes['position']!.count,
    );
  });

  it('merges static meshes into one per material, in world space, and frees the originals', () => {
    const red = new THREE.MeshBasicMaterial({ color: 'red' });
    const blue = new THREE.MeshBasicMaterial({ color: 'blue' });
    const root = new THREE.Group();
    const a = box(root, red, [1, 1, 1], [0, 0, 0]);
    box(root, red, [1, 1, 1], [10, 0, 0]);
    box(root, blue, [1, 1, 1], [0, 5, 0]);
    const dispose = vi.fn();
    a.geometry.addEventListener('dispose', dispose);
    const merged = mergeStatic(root);
    expect(merged.children).toHaveLength(2);
    const redMesh = merged.children.find((m) => (m as THREE.Mesh).material === red) as THREE.Mesh;
    redMesh.geometry.computeBoundingBox();
    expect(redMesh.geometry.boundingBox!.max.x).toBeGreaterThan(10);
    expect(dispose).toHaveBeenCalled();
  });

  it('does not merge transparent materials into the shadow pass', () => {
    const root = new THREE.Group();
    box(root, new THREE.MeshBasicMaterial({ transparent: true }), [1, 1, 1], [0, 0, 0]);
    const [mesh] = mergeStatic(root).children as THREE.Mesh[];
    expect(mesh!.castShadow).toBe(false);
    expect(mesh!.receiveShadow).toBe(true);
  });
});

describe('DomainError', () => {
  it('carries a code and an HTTP status that defaults to a conflict', () => {
    const error = new DomainError('VERSION_CONFLICT');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      code: 'VERSION_CONFLICT',
      status: 409,
      message: 'VERSION_CONFLICT',
    });
    expect(error.name).toBe('DomainError');
    expect(new DomainError('NOT_FOUND', 404).status).toBe(404);
  });
});

describe('useSceneKeys', () => {
  let env: BrowserEnv;
  const calls: string[] = [];
  let held: { current: Set<string> };
  beforeEach(() => {
    env = installBrowserEnv();
    calls.length = 0;
    held = { current: new Set() };
    renderHook(useSceneKeys, held, {
      floor: 2,
      onFloor: (f: number) => calls.push(`floor:${f}`),
      onToggleFollow: () => calls.push('follow'),
      onToggleExploded: () => calls.push('exploded'),
      onCamera: () => calls.push('camera'),
    });
  });
  afterAll(removeBrowserEnv);
  const press = (key: string, extra: Record<string, unknown> = {}) => {
    const event = domEvent('keydown', { key, target: null, ...extra });
    env.window.dispatchEvent(event);
    return event;
  };

  it('records movement keys for the camera loop and tells automation to yield', () => {
    press('W');
    expect([...held.current]).toEqual(['w']);
    expect(calls).toEqual(['camera']);
    env.window.dispatchEvent(domEvent('keyup', { key: 'W' }));
    expect(held.current.size).toBe(0);
  });

  it('holds Shift for speed without calling it a camera move, and stops the page scrolling on arrows', () => {
    press('Shift');
    expect(calls).toEqual([]);
    expect(held.current.has('shift')).toBe(true);
    expect(press('ArrowUp').defaultPrevented).toBe(true);
    expect(press('w').defaultPrevented).toBe(false);
  });

  it('changes floor by number, bracket and page keys, relative to the current floor', () => {
    press('1');
    press('5');
    press(']');
    press('[');
    press('PageUp');
    press('Home');
    expect(calls).toEqual(['floor:0', 'floor:4', 'floor:3', 'floor:1', 'floor:3', 'floor:2']);
  });

  it('toggles follow and the exploded view', () => {
    press('f');
    press('X');
    expect(calls).toEqual(['follow', 'exploded']);
  });

  it('leaves browser shortcuts and typing alone', () => {
    press('f', { metaKey: true });
    press('x', { ctrlKey: true });
    press('w', { target: { tagName: 'INPUT', closest: () => null } });
    press('a', { target: { tagName: 'DIV', closest: () => ({}) } }); // inside an action menu
    expect(calls).toEqual([]);
    expect(held.current.size).toBe(0);
  });

  it('forgets held keys when the window loses focus', () => {
    press('w');
    press('d');
    env.window.dispatchEvent(new Event('blur'));
    expect(held.current.size).toBe(0);
  });
});
