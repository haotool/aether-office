import { describe, expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import {
  FLOORS,
  FLOOR_CAPACITY,
  assignSeats,
  defaultLayout,
} from '../../packages/office-scene/src/environment/layout.js';
import { mergeLayout } from '../../apps/web/src/features/office/layout-merge.js';
import {
  MAX_SEATS,
  parseSeats,
  serializeSeats,
} from '../../apps/web/src/features/office/seat-store.js';

const agent = (id: string): Agent =>
  ({ id, projectId: 'p', name: id, activity: 'working', species: 'fox', color: '#fff' }) as Agent;
const people = (n: number, from = 0) => Array.from({ length: n }, (_, i) => agent(`a${from + i}`));
const deskOf = (layout: ReturnType<typeof defaultLayout>, id: string) =>
  layout.objects.find((o) => o.agentId === id)?.id;

describe('assignSeats (sticky desks)', () => {
  it('the first arrival order is the first-free-slot order, as the generated building always was', () => {
    const agents = people(5);
    const seats = assignSeats(new Map(), agents);
    expect([...seats.values()]).toEqual([0, 1, 2, 3, 4].map((s) => [0, s]));
    const fresh = defaultLayout(agents);
    for (const a of agents)
      expect(
        deskOf(
          defaultLayout(agents, () => 0, seats),
          a.id,
        ),
      ).toBe(deskOf(fresh, a.id));
  });

  it('reordering by activity moves nobody', () => {
    const agents = people(6);
    const first = assignSeats(new Map(), agents);
    const again = assignSeats(first, [...agents].reverse());
    for (const a of agents) expect(again.get(a.id)).toEqual(first.get(a.id));
  });

  it('a new arrival takes the first free slot and moves nobody; a departure leaves a hole for a later arrival', () => {
    const agents = people(4);
    const first = assignSeats(new Map(), agents);
    const arrived = assignSeats(first, [agent('late'), ...agents]);
    expect(arrived.get('late')).toEqual([0, 4]);
    const left = assignSeats(arrived, agents.filter((a) => a.id !== 'a1').concat(agent('late')));
    expect(left.has('a1')).toBe(false);
    for (const id of ['a0', 'a2', 'a3', 'late']) expect(left.get(id)).toEqual(arrived.get(id));
    expect(
      assignSeats(left, [...left.keys()].map(agent).concat(agent('newer'))).get('newer'),
    ).toEqual([0, 1]);
  });

  it('the generated building keeps the hole: desks of the others stay, the free one is empty', () => {
    const agents = people(4);
    const seats = assignSeats(new Map(), agents);
    const rest = agents.filter((a) => a.id !== 'a1');
    const layout = defaultLayout(rest, () => 0, assignSeats(seats, rest));
    expect(layout.objects.find((o) => o.id === 'desk-1')?.agentId).toBeNull();
    expect(deskOf(layout, 'a3')).toBe('desk-3');
  });

  it('a full floor spills the next arrival to the next floor, and a freed slot is not skipped', () => {
    const full = people(FLOOR_CAPACITY);
    const seats = assignSeats(new Map(), full);
    const next = assignSeats(seats, [...full, agent('over')]);
    expect(next.get('over')).toEqual([1, 0]);
    const gone = assignSeats(next, [...full.slice(1), agent('over')]);
    expect(gone.get('over')).toEqual([1, 0]);
    expect(assignSeats(gone, [...full.slice(1), agent('over'), agent('x')]).get('x')).toEqual([
      0, 0,
    ]);
  });

  it('respects the floor an arrival works on', () => {
    expect(assignSeats(new Map(), [agent('a')], () => 2).get('a')).toEqual([2, 0]);
  });

  it('a building with no room anywhere seats nobody beyond the capacity', () => {
    const all = people(FLOOR_CAPACITY * FLOORS + 3);
    expect(assignSeats(new Map(), all).size).toBe(FLOOR_CAPACITY * FLOORS);
  });

  it('ignores remembered seats that are invalid or shared', () => {
    const bad = new Map<string, readonly [number, number]>([
      ['a0', [0, 3]],
      ['a1', [0, 3]],
      ['a2', [99, 0]],
      ['a3', [0, 1.5]],
      ['a4', [0, FLOOR_CAPACITY]],
    ]);
    const seats = assignSeats(bad, people(5));
    expect(seats.get('a0')).toEqual([0, 3]);
    expect(new Set([...seats.values()].map(([f, s]) => `${f}:${s}`)).size).toBe(5);
  });
});

describe('mergeLayout with seats', () => {
  it('without a saved layout the desks follow the seats, not the arrival order', () => {
    const agents = people(3);
    const seats = assignSeats(new Map(), agents);
    const flipped = [...agents].reverse();
    const layout = mergeLayout(null, [], flipped, () => 0, { seats })!;
    for (const a of agents) expect(deskOf(layout, a.id)).toBe(`desk-${seats.get(a.id)![1]}`);
  });

  it('a saved layout is never rearranged by seats', () => {
    const [a, b] = people(2);
    const saved = defaultLayout([a!, b!]);
    const seats = new Map<string, readonly [number, number]>([[b!.id, [0, 0]]]);
    expect(mergeLayout(saved, [], [b!, a!], () => 0, { seats })).toBe(saved);
  });
});

describe('seat storage', () => {
  it('round-trips ids and integers', () => {
    const seats = assignSeats(new Map(), people(4), (a) => Number(a.id.slice(1)) % 2);
    expect(parseSeats(serializeSeats(seats))).toEqual(seats);
  });

  it.each([
    ['null', null],
    ['not json', '{oops'],
    ['wrong version', JSON.stringify({ v: 2, seats: [['a', 0, 0]] })],
    ['wrong shape', JSON.stringify({ v: 1, seats: 'x' })],
    ['an array', '[1,2]'],
  ])('reads %s as no seats', (_n, raw) => {
    expect(parseSeats(raw).size).toBe(0);
  });

  it('drops malformed rows and keeps the rest', () => {
    const raw = JSON.stringify({
      v: 1,
      seats: [
        ['a', 0, 1],
        [7, 0, 0],
        ['b', 'x', 0],
        ['c', 1, 2.5],
        ['d', 2, 3],
      ],
    });
    expect([...parseSeats(raw)]).toEqual([
      ['a', [0, 1]],
      ['d', [2, 3]],
    ]);
  });

  it('is bounded: only the last MAX_SEATS entries are stored and read', () => {
    const seats = new Map(
      Array.from({ length: MAX_SEATS + 20 }, (_, i) => [`s${i}`, [0, 0] as const]),
    );
    const back = parseSeats(serializeSeats(seats));
    expect(back.size).toBe(MAX_SEATS);
    expect(back.has('s0')).toBe(false);
    expect(back.has(`s${MAX_SEATS + 19}`)).toBe(true);
  });
});
