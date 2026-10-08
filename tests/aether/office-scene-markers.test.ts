import { describe, expect, it } from 'vitest';
import type { Agent, Layout } from '../../packages/contracts/src/index.js';
import {
  EXPLODED_GAP,
  FLOOR_HEIGHT,
} from '../../packages/office-scene/src/environment/building.js';
import {
  deskItemsGeometry,
  deskItemsMaterial,
} from '../../packages/office-scene/src/desks/desk-items.js';
import { wordsFor } from '../../packages/office-scene/src/core/interaction-text.js';
import { floorZones } from '../../packages/office-scene/src/environment/layout.js';
import {
  beaconsOf,
  beamsOf,
  labelsOf,
} from '../../packages/office-scene/src/scene/scene-markers.js';
import type { BranchInfo } from '../../packages/office-scene/src/scene/scene-types.js';

const agent = (id: string, name = id, activity = 'idle'): Agent =>
  ({ id, name, activity }) as Agent;
const desk = (agentId: string, over: Record<string, unknown> = {}) => ({
  agentId,
  x: 10,
  z: 4,
  floor: 1,
  rotation: 0,
  ...over,
});
const layout = (...desks: ReturnType<typeof desk>[]) =>
  ({ schemaVersion: 2, zones: [], objects: desks }) as unknown as Layout;
const FLOOR_Y = (floor: number, exploded = false) =>
  floor * (FLOOR_HEIGHT + (exploded ? EXPLODED_GAP : 0));

describe('labelsOf', () => {
  it('puts a name tag over each seated member, sized for CJK as two columns', () => {
    const tags = labelsOf(
      [agent('a', 'Ada'), agent('b', '小明'), agent('nodesk', 'Ghost')],
      layout(desk('a'), desk('b', { x: -3 })),
      1,
      false,
    );
    const members = tags.filter((t) => ['a', 'b', 'nodesk'].includes(t.id));
    expect(members.map((t) => t.id)).toEqual(['a', 'b']); // no desk, no tag
    expect(members[0]).toMatchObject({ x: 10, z: 4, y: FLOOR_Y(1) + 2 });
    expect(members[1]!.width - members[0]!.width).toBe((4 - 3) * 6); // 小明 is 4 columns, Ada is 3
  });

  it('adds a tag over each zone of the floor but the atrium, and none when the building is exploded', () => {
    const zones = floorZones(2).filter((z) => z.id !== 'atrium');
    const tags = labelsOf([], layout(), 2, false);
    expect(tags.map((t) => t.id)).toEqual(zones.map((z) => z.id));
    expect(tags.every((t) => t.width === 110)).toBe(true);
    expect(labelsOf([], layout(), 2, true)).toEqual([]);
  });

  it('lifts a tag with the floor, further apart when exploded', () => {
    const at = (exploded: boolean) => labelsOf([agent('a')], layout(desk('a')), 1, exploded)[0]!.y;
    expect(at(true) - at(false)).toBe(EXPLODED_GAP);
  });
});

describe('beamsOf', () => {
  const info = (over: Partial<BranchInfo> = {}): BranchInfo => ({
    branch: 'main',
    linked: false,
    dirty: 0,
    ahead: 0,
    behind: 0,
    ...over,
  });
  const colorOf = (branch: BranchInfo) =>
    beamsOf([agent('a')], layout(desk('a')), false, () => branch)[0]!.color;

  it('colours a beam by what the checkout is: uncommitted, detached, a linked worktree or the main one', () => {
    expect(colorOf(info({ dirty: 2 }))).toBe('#ffc65c');
    expect(colorOf(info({ branch: null }))).toBe('#a592ff');
    expect(colorOf(info({ linked: true }))).toBe('#43e6df');
    expect(colorOf(info())).toBe('#e8f2f8');
    expect(colorOf(info({ dirty: 1, branch: null }))).toBe('#ffc65c'); // uncommitted wins over detached
  });

  it('runs from the desk up into the elevator core and flows only while the member works', () => {
    const beams = beamsOf(
      [agent('a', 'a', 'working'), agent('b', 'b', 'idle')],
      layout(desk('a'), desk('b')),
      false,
      () => info(),
    );
    expect(beams[0]).toMatchObject({
      from: [10, FLOOR_Y(1) + 1.45, 3.7],
      to: [0, FLOOR_Y(1) + 5.4, 0],
    });
    expect(beams.map((b) => b.flowing)).toEqual([true, false]);
  });

  it('skips members outside a repository or without a desk', () => {
    expect(beamsOf([agent('a')], layout(desk('a')), false, () => null)).toEqual([]);
    expect(beamsOf([agent('a')], layout(), false, () => info())).toEqual([]);
  });
});

describe('beaconsOf', () => {
  it('floats the marker in front of the seat, turning with the desk', () => {
    const at = (rotation: number) =>
      beaconsOf([agent('a', 'a', 'working')], layout(desk('a', { rotation })), false)[0]!;
    expect(at(0)).toMatchObject({ x: 10, z: 4.86, activity: 'working' });
    expect(at(1).x).toBeCloseTo(10.86);
    expect(at(1).z).toBeCloseTo(4);
    expect(at(2).z).toBeCloseTo(3.14);
    expect(at(0).y).toBe(FLOOR_Y(1) + 2.25);
  });

  it('has no marker for a member without a desk', () => {
    expect(beaconsOf([agent('a')], layout(), false)).toEqual([]);
  });
});

describe('scene words', () => {
  it('speak both languages with the same set of keys', () => {
    const zh = wordsFor(true);
    const en = wordsFor(false);
    const shape = (value: unknown): unknown =>
      typeof value === 'object' && value !== null
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
        : typeof value;
    expect(shape(zh)).toEqual(shape(en));
    expect(zh.state.working).not.toBe(en.state.working);
  });

  it('never leaves a word empty', () => {
    const empties: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        if (!value.trim()) empties.push(path);
      } else if (value && typeof value === 'object')
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    walk(wordsFor(true), 'zh');
    walk(wordsFor(false), 'en');
    expect(empties).toEqual([]);
  });
});

describe('desk items', () => {
  it('has no geometry for an empty desk', () => {
    expect(deskItemsGeometry([], 0)).toBeNull();
  });

  it('shares one geometry per set of things, whatever the order they are listed in', () => {
    expect(deskItemsGeometry(['plant', 'mug'], 1)).toBe(deskItemsGeometry(['mug', 'plant'], 1));
    expect(deskItemsGeometry(['plant', 'mug'], 1)).not.toBe(deskItemsGeometry(['plant'], 1));
  });

  it('lets the tint choose only the mug’s colour', () => {
    expect(deskItemsGeometry(['mug'], 0)).not.toBe(deskItemsGeometry(['mug'], 1));
    expect(deskItemsGeometry(['mug'], 1)).toBe(deskItemsGeometry(['mug'], 5)); // four mug colours
    expect(deskItemsGeometry(['plant'], 0)).toBe(deskItemsGeometry(['plant'], 3));
  });

  it('carries only position, normal and colour, with a colour for every vertex, above the desk top', () => {
    const geometry = deskItemsGeometry(['mug', 'headphones', 'sticky'], 2)!;
    expect(Object.keys(geometry.attributes).sort()).toEqual(['color', 'normal', 'position']);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeGreaterThan(0.5);
  });

  it('uses one vertex-coloured material for every desk', () => {
    expect(deskItemsMaterial()).toBe(deskItemsMaterial());
    expect(deskItemsMaterial().vertexColors).toBe(true);
  });
});
