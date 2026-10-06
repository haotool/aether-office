import { describe, expect, it } from 'vitest';
import type { Layout } from '../../packages/contracts/src/index.js';
import { checkSeat, movedTo, snapSeat } from '../../packages/office-scene/src/seat-drag.js';
import { seatMoveLayout } from '../../apps/web/src/features/seat-move.js';

const desk = (id: string, x: number, z: number, agentId: string | null = null, floor = 0) =>
  ({ id, type: 'desk', x, z, rotation: 0, agentId, floor }) as Layout['objects'][number];
const layout = (...objects: Layout['objects']): Layout => ({
  schemaVersion: 1,
  objects,
  zones: [],
});

describe('dragging a desk to another seat', () => {
  const office = layout(
    desk('a', -10, -6, 'agent-a'),
    desk('b', -14, -6, 'agent-b'),
    desk('c', 10, 6, 'local:claude:c'),
    desk('upstairs', -10, -6, null, 1),
    { id: 'plant', type: 'plant', x: 22, z: 5, rotation: 0, agentId: null, floor: 0 },
  );

  it('snaps to the layout editor grid', () => {
    expect(snapSeat(3.2)).toBe(3);
    expect(snapSeat(3.3)).toBe(3.5);
    expect(snapSeat(-0.26)).toBe(-0.5);
  });

  it('moves one desk and leaves the layout it was given alone', () => {
    const moved = movedTo(office, 'a', -18, 2);
    expect(moved.objects.find((o) => o.id === 'a')).toMatchObject({ x: -18, z: 2 });
    expect(moved.objects.find((o) => o.id === 'b')).toMatchObject({ x: -14, z: -6 });
    expect(office.objects.find((o) => o.id === 'a')).toMatchObject({ x: -10, z: -6 });
  });

  it.each([
    ['a free seat', -18, 2, { ok: true }],
    ['the seat it is on (a move of nothing is still a valid seat)', -10, -6, { ok: true }],
    ['on top of another desk', -14.5, -6, { ok: false, reason: 'occupied' }],
    ['a desk touching another is an overlap', -12.5, -6, { ok: false, reason: 'occupied' }],
    [
      'across the building from a desk on another floor (floors do not collide)',
      -10,
      -6,
      { ok: true },
    ],
    ['in the main aisle', 0, 6, { ok: false, reason: 'aisle' }],
    ['the cross aisle', -18, 0.5, { ok: false, reason: 'aisle' }],
    ['outside the office', 30, 6, { ok: false, reason: 'bounds' }],
    ['over the plant', 22, 5, { ok: false, reason: 'occupied' }],
  ])('%s', (_name, x, z, want) => {
    expect(checkSeat(office, 'a', x, z)).toEqual(want);
  });
});

describe('the layout a drop saves', () => {
  const live = new Set(['agent-a', 'local:claude:c', 'local:claude:new']);
  const move = (agentId: string, deskId: string) => ({
    agentId,
    deskId,
    floor: 0,
    from: { x: 0, z: 0 },
    to: { x: -18, z: 2 },
  });

  it('changes the saved desk of a managed member and nothing else; undo is the layout as it was', () => {
    const saved = layout(desk('a', -10, -6, 'agent-a'), desk('x', 10, 6));
    const { next, previous } = seatMoveLayout({
      saved,
      shown: saved,
      move: move('agent-a', 'a'),
      liveIds: live,
    });
    expect(next.objects).toEqual([desk('a', -18, 2, 'agent-a'), desk('x', 10, 6)]);
    expect(previous).toBe(saved);
  });

  it('writes an automatically seated session now, under its own id, into a saved layout', () => {
    const saved = layout(desk('a', -10, -6, 'agent-a'));
    const shown = layout(
      desk('a', -10, -6, 'agent-a'),
      desk('desk-obs-0-3', 10, 6, 'local:claude:c'),
    );
    const { next } = seatMoveLayout({
      saved,
      shown,
      move: move('local:claude:c', 'desk-obs-0-3'),
      liveIds: live,
    });
    expect(next.objects.map((o) => o.id)).toEqual(['a', 'desk-obs-0-3']);
    expect(next.objects[1]).toMatchObject({ x: -18, z: 2, agentId: 'local:claude:c' });
  });

  it("takes a free id when the automatic one is already some other member's saved desk", () => {
    const saved = layout(desk('desk-obs-0-3', 12, 6, 'local:claude:gone'));
    const shown = layout(desk('desk-obs-0-3', 10, 6, 'local:claude:new'));
    const { next } = seatMoveLayout({
      saved,
      shown,
      move: move('local:claude:new', 'desk-obs-0-3'),
      liveIds: live,
    });
    expect(new Set(next.objects.map((o) => o.id)).size).toBe(next.objects.length);
    expect(next.objects.find((o) => o.agentId === 'local:claude:new')!.id).toBe('desk-obs-0-3-2');
  });

  it('with no saved layout saves what the person sees, and forgets the seats of sessions that left', () => {
    const shown = layout(
      desk('a', -10, -6, 'agent-a'),
      desk('c', 10, 6, 'local:claude:c'),
      desk('old', 14, 6, 'local:claude:ended'),
      desk('spare', 18, 6),
    );
    const { next, previous } = seatMoveLayout({
      saved: null,
      shown,
      move: move('agent-a', 'a'),
      liveIds: live,
    });
    expect(next.objects.map((o) => o.id)).toEqual(['a', 'c', 'spare']);
    expect(previous).toBe(shown);
  });
});
