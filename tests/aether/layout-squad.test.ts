import { describe, expect, it } from 'vitest';
import { layoutSchema, type Agent, type Layout } from '../../packages/contracts/src/index.js';
import {
  buildNavGrid,
  findPath,
  layoutVersionOf,
  objectBounds,
  squadCapacity,
  validateLayout,
  type PlacedObject,
} from '../../packages/kernel/src/index.js';
import {
  FLOORS,
  FLOOR_CAPACITY,
  defaultLayout,
  seatAt,
} from '../../packages/office-scene/src/environment/layout.js';
import {
  MAX_SQUAD_SEATS,
  placeSquads,
  podsOf,
  squadLayout,
  squadObjectOf,
} from '../../packages/office-scene/src/squad/squad-layout.js';
import { mergeLayout } from '../../apps/web/src/features/office/layout-merge.js';

const desk = (
  id: string,
  x: number,
  z: number,
  extra: Partial<PlacedObject> = {},
): PlacedObject => ({
  id,
  type: 'desk',
  x,
  z,
  rotation: 0,
  agentId: null,
  ...extra,
});
const squad = (extra: Partial<PlacedObject> = {}): PlacedObject => ({
  id: 'sq',
  type: 'squad',
  x: -6,
  z: -6,
  rotation: 0,
  agentId: null,
  anchor: 'd',
  span: [4, 2.5],
  seats: 0,
  ...extra,
});
const agent = (id: string): Agent =>
  ({ id: `local:claude:${id}`, name: id, role: 'engineer' }) as unknown as Agent;

describe('the layout schema keeps every saved layout valid', () => {
  // Written by a build that knew no squads: the key order and the defaulted fields are exactly the old ones.
  const v1 =
    '{"schemaVersion":1,"objects":[{"id":"desk-0","type":"desk","x":-22,"z":-6,"rotation":0,"agentId":"local:claude:abc","floor":0},' +
    '{"id":"plant-0","type":"plant","x":-23,"z":5,"rotation":0,"agentId":null,"floor":2}],"zones":[{"id":"atrium","name":"指揮中庭"}]}';

  it('round-trips a version 1 layout byte for byte, and the generated default layout too', () => {
    expect(JSON.stringify(layoutSchema.parse(JSON.parse(v1)))).toBe(v1);
    const generated = defaultLayout([agent('a1')]);
    expect(JSON.stringify(layoutSchema.parse(JSON.parse(JSON.stringify(generated))))).toBe(
      JSON.stringify(generated),
    );
    expect(generated.schemaVersion).toBe(1);
  });

  it('accepts version 2, round-trips a squad, and refuses a squad in a version 1 layout', () => {
    const withSquad = {
      schemaVersion: 2,
      objects: [
        { ...desk('d', -10, -6), floor: 0 },
        { ...squad({ x: -6, z: -6 }), floor: 0 },
      ],
      zones: [],
    };
    const text = JSON.stringify(layoutSchema.parse(withSquad));
    expect(JSON.parse(text)).toEqual(withSquad);
    expect(layoutSchema.parse(JSON.parse(text))).toEqual(layoutSchema.parse(withSquad));
    expect(layoutSchema.safeParse({ ...withSquad, schemaVersion: 1 }).success).toBe(false);
    expect(layoutSchema.safeParse({ ...withSquad, schemaVersion: 3 }).success).toBe(false);
    expect(
      layoutSchema.safeParse({ schemaVersion: 2, objects: [desk('d', -10, -6)], zones: [] })
        .success,
    ).toBe(true);
  });

  it('bounds a squad: span in half metres within 3-12 by 2.5-8, seats 0-12, no stray fields', () => {
    const parse = (extra: object) =>
      layoutSchema.safeParse({ schemaVersion: 2, objects: [{ ...squad(), ...extra }], zones: [] })
        .success;
    expect(parse({})).toBe(true);
    expect(parse({ span: [2.5, 2.5] })).toBe(false);
    expect(parse({ span: [13, 3] })).toBe(false);
    expect(parse({ span: [4, 9] })).toBe(false);
    expect(parse({ span: [4.25, 3] })).toBe(false);
    expect(parse({ seats: 13 })).toBe(false);
    expect(parse({ agentId: 'x' })).toBe(false);
    expect(parse({ extra: 1 })).toBe(false);
    expect(parse({ anchor: undefined })).toBe(false);
  });

  it('names the layout version after what it holds', () => {
    expect(layoutVersionOf([desk('d', -10, -6)])).toBe(1);
    expect(layoutVersionOf([desk('d', -10, -6), squad()])).toBe(2);
    expect(layoutVersionOf([])).toBe(1);
  });
});

describe('squad validation', () => {
  const base = [desk('d', -10, -6)];
  it('accepts a squad beside its anchor desk, touching it or a little apart', () => {
    expect(() =>
      validateLayout([...base, squad({ x: -6.9 + 0.0, z: -6, span: [4, 2.5] })]),
    ).not.toThrow();
    expect(() => validateLayout([...base, squad({ x: -6.5 })])).not.toThrow();
  });

  it.each([
    ['a missing anchor', [...base, squad({ anchor: 'nope' })], 'LAYOUT_SQUAD_ANCHOR'],
    [
      'an anchor that is not a desk',
      [desk('p', -20, -6, { type: 'plant' }), squad({ anchor: 'p' })],
      'LAYOUT_SQUAD_ANCHOR',
    ],
    [
      'an anchor on another floor',
      [desk('d', -10, -6, { floor: 1 }), squad({ floor: 0 })],
      'LAYOUT_SQUAD_ANCHOR',
    ],
    [
      'two squads on one anchor',
      [...base, squad({ id: 'a', x: -6 }), squad({ id: 'b', x: -6, z: -12 })],
      'LAYOUT_SQUAD_DUPLICATE',
    ],
    [
      'more seats than the span holds',
      [...base, squad({ span: [4, 2.5], seats: 3 })],
      'LAYOUT_SQUAD_CAPACITY',
    ],
    ['a squad over its anchor desk', [...base, squad({ x: -10, z: -6 })], 'LAYOUT_OVERLAP'],
    [
      'a squad over other furniture',
      [...base, desk('o', -6, -6), squad({ x: -6, z: -6 })],
      'LAYOUT_OVERLAP',
    ],
    [
      'a squad out of bounds',
      [desk('d', -22, -6), squad({ x: -24, z: -6 })],
      'LAYOUT_OUT_OF_BOUNDS',
    ],
    ['a squad across the aisle', [...base, squad({ x: -1, z: -6 })], 'LAYOUT_BLOCKS_AISLE'],
  ])('rejects %s', (_name, objects, code) => {
    expect(() => validateLayout(objects)).toThrow(code);
  });

  it('measures a squad by its span, swapped when rotated, and computes capacity by the formula', () => {
    expect(objectBounds(squad({ span: [6, 3], x: 0, z: 0 }))).toEqual({
      minX: -3,
      maxX: 3,
      minZ: -1.5,
      maxZ: 1.5,
    });
    expect(objectBounds(squad({ span: [6, 3], x: 0, z: 0, rotation: 1 }))).toEqual({
      minX: -1.5,
      maxX: 1.5,
      minZ: -3,
      maxZ: 3,
    });
    expect(squadCapacity([3, 2.5])).toBe(1);
    expect(squadCapacity([4, 2.5])).toBe(2);
    expect(squadCapacity([7, 5.5])).toBe(12);
    expect(squadCapacity([12, 8])).toBe(28);
    expect(() =>
      validateLayout([...base, squad({ span: [7, 5.5], seats: 12, x: -5, z: -9 })]),
    ).not.toThrow();
  });

  it('a squad is floor to walk on, but its anchor desk stays an obstacle', () => {
    const objects = [desk('d', -10, -6), squad({ x: -6, z: -6, span: [4, 2.5] })];
    const grid = buildNavGrid(objects);
    expect(findPath(grid, { x: -6.5, z: -6 }, { x: -4, z: -6 }).status).toBe('ok');
    const straight = findPath(grid, { x: -6.5, z: -6 }, { x: -4, z: -6 });
    if (straight.status === 'ok') expect(straight.points).toHaveLength(2); // a straight line through the zone
    const blocked = buildNavGrid([desk('d', -10, -6)]);
    expect(grid.blocked).toEqual(blocked.blocked); // the squad adds no blocked cell
  });
});

describe('auto squads', () => {
  const layout = defaultLayout([agent('a1')]);
  const supervisorOf = (floor: number) =>
    layout.objects.find(
      (o) =>
        o.type === 'desk' &&
        (o.floor ?? 0) === floor &&
        o.x === seatAt(3)[0] &&
        o.z === seatAt(3)[1],
    )!;

  it('finds a valid zone of the right size for 1 to 12 seats on the default layout of every floor', () => {
    for (let floor = 0; floor < FLOORS; floor++) {
      const supervisor = supervisorOf(floor);
      for (let count = 1; count <= MAX_SQUAD_SEATS; count++) {
        const rect = squadLayout(layout, supervisor.id, count);
        expect(rect, `floor ${floor} count ${count}`).not.toBeNull();
        expect(podsOf(rect!).length).toBeGreaterThanOrEqual(Math.max(2, count));
        const withZone: Layout = {
          ...layout,
          schemaVersion: 2,
          objects: [...layout.objects, squadObjectOf(rect!, 'sq')],
        };
        expect(() =>
          validateLayout(withZone.objects.filter((o) => (o.floor ?? 0) === floor)),
        ).not.toThrow();
        expect(layoutSchema.safeParse(withZone).success).toBe(true);
      }
    }
  });

  it('also fits beside the outermost desks of the top row, sliding along the desk edge to stay on the floor', () => {
    for (const floor of [0, 1]) {
      for (const x of [-22, 22]) {
        const outer = layout.objects.find(
          (o) => o.type === 'desk' && (o.floor ?? 0) === floor && o.x === x && o.z === -6,
        )!;
        const rect = squadLayout(layout, outer.id, 4)!;
        expect(rect, `floor ${floor} x ${x}`).not.toBeNull();
        expect(Math.abs(rect.x) + rect.width / 2).toBeLessThanOrEqual(25);
      }
    }
  });

  it('is deterministic, sizes to whole rows with a pair at least, and caps at twelve', () => {
    const d = supervisorOf(0);
    expect(squadLayout(layout, d.id, 5)).toEqual(squadLayout(layout, d.id, 5));
    const pods = (n: number) => podsOf(squadLayout(layout, d.id, n)!).length;
    expect(pods(1)).toBe(2);
    expect(pods(2)).toBe(2);
    expect(pods(3)).toBe(3);
    expect(pods(5)).toBe(8);
    expect(pods(12)).toBe(12);
    expect(pods(40)).toBe(12);
  });

  it('puts the zone on the side that faces the central aisle first', () => {
    const left = squadLayout(layout, supervisorOf(0).id, 3)!;
    expect(left.x).toBeGreaterThan(supervisorOf(0).x); // a desk west of the aisle: its zone is east of it
    const right = layout.objects.find(
      (o) => o.type === 'desk' && o.x === 10 && o.z === -6 && !o.floor,
    )!;
    expect(squadLayout(layout, right.id, 3)!.x).toBeLessThan(right.x);
  });

  it('returns a saved zone as it is, whatever the count', () => {
    const d = supervisorOf(0);
    const pinned: Layout = {
      ...layout,
      schemaVersion: 2,
      objects: [
        ...layout.objects,
        { ...squadObjectOf(squadLayout(layout, d.id, 4)!, 'saved'), seats: 2 },
      ],
    };
    expect(squadLayout(pinned, d.id, 12)).toMatchObject({ anchor: d.id, seats: 4 });
    expect(squadLayout(pinned, d.id, 12)).toEqual(squadLayout(pinned, d.id, 1));
  });

  it('falls back to null on a full floor, for an unknown desk and for a non-desk', () => {
    const full = defaultLayout(Array.from({ length: FLOOR_CAPACITY }, (_, i) => agent(`a${i}`)));
    const d = full.objects.find(
      (o) => o.type === 'desk' && !o.floor && o.agentId === 'local:claude:a31',
    )!; // outer column, mid-floor: neighbours on every side
    expect(squadLayout(full, d.id, 3)).toBeNull();
    expect(squadLayout(layout, 'nope', 3)).toBeNull();
    expect(squadLayout(layout, layout.objects.find((o) => o.type === 'plant')!.id, 3)).toBeNull();
  });

  it('keeps zones apart when several supervisors are placed in one go', () => {
    const [a, b] = ['desk-3', 'desk-2'].map((id) => layout.objects.find((o) => o.id === id)!);
    const placed = placeSquads(layout, [
      { deskId: a!.id, count: 6 },
      { deskId: b!.id, count: 6 },
    ]);
    const [first, second] = [placed.get(a!.id), placed.get(b!.id)];
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const box = (r: NonNullable<typeof first>) => ({
      minX: r.x - r.width / 2,
      maxX: r.x + r.width / 2,
      minZ: r.z - r.depth / 2,
      maxZ: r.z + r.depth / 2,
    });
    const [p, q] = [box(first!), box(second!)];
    expect(p.minX < q.maxX && p.maxX > q.minX && p.minZ < q.maxZ && p.maxZ > q.minZ).toBe(false);
  });

  it('lays pods out on a grid inside the zone, one pitch apart, and none for a zone too small', () => {
    const pods = podsOf({ x: 0, z: 0, width: 7, depth: 5.5 });
    expect(pods).toHaveLength(12);
    expect(pods.map((p) => p.index)).toEqual([...pods.keys()]);
    for (const p of pods) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(3.5 - 0.2);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(2.75 - 0.2);
    }
    expect(Math.abs(pods[1]!.x - pods[0]!.x)).toBeCloseTo(1.6);
    expect(podsOf({ x: 0, z: 0, width: 1, depth: 1 })).toEqual([]);
  });
});

describe('seating subagents when the building has squads', () => {
  const parent = { ...agent('local:claude:p'), id: 'local:claude:p' };
  const kids = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...agent(`local:claude:p:sub:${i}`),
      id: `local:claude:p:sub:${i}`,
    }));

  it('keeps giving every subagent a desk unless the squad layout is asked for', () => {
    const merged = mergeLayout(defaultLayout([]), [], [parent, ...kids(3)])!;
    const seated = merged.objects.filter((o) => o.agentId?.includes(':sub:'));
    expect(seated).toHaveLength(3);
  });

  it('skips :sub: ids when their squad fits, and never moves an existing desk', () => {
    const saved: Layout = {
      schemaVersion: 1,
      objects: [desk('p', -10, -6, { agentId: parent.id, floor: 0 }) as Layout['objects'][number]],
      zones: [],
    };
    const merged = mergeLayout(saved, [], [parent, ...kids(3)], () => 0, { squads: true })!;
    expect(merged.objects.some((o) => o.agentId?.includes(':sub:'))).toBe(false);
    expect(merged.objects.some((o) => o.agentId === parent.id)).toBe(true);
    for (const o of saved.objects) expect(merged.objects).toContainEqual(o);
  });

  it('falls back to desks for the subagents when no zone fits beside the parent', () => {
    const crowded = defaultLayout(
      Array.from({ length: FLOOR_CAPACITY - 1 }, (_, i) => agent(`a${i}`)),
    );
    const merged = mergeLayout(crowded, [], [parent, ...kids(2)], () => 0, { squads: true })!;
    const seated = merged.objects.filter((o) => o.agentId?.includes(':sub:'));
    expect(seated.length).toBe(2);
  });

  it('seats a subagent at a desk when its parent has no desk', () => {
    const merged = mergeLayout(defaultLayout([]), [], kids(1), () => 0, { squads: true })!;
    expect(merged.objects.filter((o) => o.agentId?.includes(':sub:'))).toHaveLength(1);
  });
});
