import { describe, expect, it } from 'vitest';
import { layoutSchema } from '../../packages/contracts/src/index.js';
import { validateLayout, type PlacedObject } from '../../packages/kernel/src/index.js';
import { command, fixture } from './fixture.js';

const desk = (
  id: string,
  x: number,
  z: number,
  extra: Partial<PlacedObject> = {},
): PlacedObject => ({ id, type: 'desk', x, z, rotation: 0, agentId: null, ...extra });
const layout = (objects: PlacedObject[]) => ({ schemaVersion: 1 as const, objects, zones: [] });

describe('layout validation (the same rules guard the editor, an import and the API)', () => {
  it('accepts a sane layout', () => {
    expect(() => validateLayout([desk('a', -10, -6), desk('b', 10, 6)])).not.toThrow();
  });

  it.each([
    ['overlap', [desk('a', -10, -6), desk('b', -9.5, -6)], 'LAYOUT_OVERLAP'],
    ['out of bounds', [desk('a', 30, -6)], 'LAYOUT_OUT_OF_BOUNDS'],
    ['blocks the main aisle', [desk('a', 0, -6)], 'LAYOUT_BLOCKS_AISLE'],
    ['duplicate id', [desk('a', -10, -6), desk('a', 10, 6)], 'LAYOUT_DUPLICATE_ID'],
    [
      'one agent at two desks',
      [desk('a', -10, -6, { agentId: 'x' }), desk('b', 10, 6, { agentId: 'x' })],
      'LAYOUT_DUPLICATE_AGENT',
    ],
  ])('rejects %s', (_name, objects, code) => {
    expect(() => validateLayout(objects)).toThrow(code);
  });

  it('the import schema refuses unknown fields, wrong versions, bad furniture and more than 600 objects', () => {
    const good = layout([desk('a', -10, -6)]);
    expect(layoutSchema.safeParse(good).success).toBe(true);
    expect(layoutSchema.safeParse({ ...good, extra: 1 }).success).toBe(false);
    expect(layoutSchema.safeParse({ ...good, schemaVersion: 2 }).success).toBe(false);
    expect(
      layoutSchema.safeParse(layout([{ ...desk('a', 1, 1), type: 'spaceship' as never }])).success,
    ).toBe(false);
    const many = Array.from({ length: 601 }, (_, i) =>
      desk(`d${i}`, -20 + (i % 10) * 4, -14 + Math.floor(i / 10) * 1.5),
    );
    expect(layoutSchema.safeParse(layout(many)).success).toBe(false);
  });
});

it('saving a layout is versioned, validated server-side, and bound to agents of the same project', () => {
  const f = fixture();
  try {
    const save = (objects: PlacedObject[], version: number) =>
      f.control.execute(
        f.owner.actor,
        command('layout.save', layout(objects), f.projectId, version),
      );
    expect(save([desk('a', -10, -6, { agentId: f.senderId })], 0).result['version']).toBe(1);
    expect(() => save([desk('a', -10, -6)], 0)).toThrow('VERSION_CONFLICT'); // stale editor
    expect(() => save([desk('a', -10, -6), desk('b', -9.5, -6)], 1)).toThrow('LAYOUT_OVERLAP'); // the server re-validates what the editor allowed
    expect(() =>
      save([desk('a', -10, -6, { agentId: '00000000-0000-4000-8000-000000000009' })], 1),
    ).toThrow('AGENT_NOT_FOUND');
    const stored = f.control.snapshot(f.owner.actor, f.projectId).layout;
    expect(stored?.version).toBe(1); // every refusal left the saved layout alone
    expect(stored?.data.objects).toHaveLength(1);
  } finally {
    f.control.close();
  }
});
