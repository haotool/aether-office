import { describe, expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import { defaultLayout } from '../../packages/office-scene/src/environment/layout.js';
import {
  EMPTY_SQUAD,
  stepSquad,
  type SquadInput,
  type SquadMemberInput,
  type SquadState,
} from '../../packages/office-scene/src/squad/squad-model.js';
import { planLeave } from '../../packages/office-scene/src/squad/errand.js';
import { createHandover } from '../../packages/office-scene/src/squad/handover/runtime.js';
import {
  buildFrame,
  eventsOf,
  gridFor,
  signatureOf,
  type Plans,
} from '../../packages/office-scene/src/squad/squad-frame.js';
import { isPodSeat } from '../../packages/office-scene/src/squad/squad-seats.js';

const SUP = 'local:claude:s1';
const T0 = 1_000_000;
const supervisor = { id: SUP, name: 's1', role: 'engineer' } as unknown as Agent;
const layout = defaultLayout([supervisor]);
const member = (n: number, over: Partial<SquadMemberInput> = {}): SquadMemberInput => ({
  id: `${SUP}:sub:a${n}`,
  type: 'Explore',
  status: 'running',
  startedAt: T0,
  lastSeen: T0,
  toolCount: 0,
  ...over,
});
const squads = (...members: SquadMemberInput[]): SquadInput[] => [{ supervisor: SUP, members }];
const run = (state: SquadState, input: SquadInput[], now: number) =>
  stepSquad(state, { squads: input, leaveMs: () => 8000 }, now);
const plans = (): Plans => ({ arrivals: new Map(), leaves: new Map() });
const frameOf = (state: SquadState, now: number, held: Plans = plans()) =>
  buildFrame({
    layout,
    view: { state, now, version: 1 },
    order: [SUP],
    quality: 'balanced',
    reducedMotion: false,
    handover: createHandover(),
    plans: held,
    state: { current: state },
  });

describe('the squad frame', () => {
  it('seats the squad beside its supervisor and adds each pod seat to the layout', () => {
    const state = run(EMPTY_SQUAD, squads(member(1), member(2)), T0 + 1000);
    const frame = frameOf(state, T0 + 1000);
    expect(frame.zones.map((z) => z.supervisor)).toEqual([SUP]);
    expect(frame.seats.map((s) => s.member)).toEqual([`${SUP}:sub:a1`, `${SUP}:sub:a2`]);
    expect(frame.layout.objects.filter(isPodSeat)).toHaveLength(2);
    expect(frame.arrivals.size).toBe(0);
    expect(frame.members).toHaveLength(2);
  });

  it('plans the walk of an arriving member once, keeps it, and drops it when the member is gone', () => {
    const first = run(EMPTY_SQUAD, squads(member(1)), T0);
    const state = run(first, squads(member(1), member(2, { startedAt: T0 + 5000 })), T0 + 5000);
    const held = plans();
    const frame = frameOf(state, T0 + 5000, held);
    const arriving = `${SUP}:sub:a2`;
    expect([...frame.arrivals.keys()]).toEqual([arriving]);
    const plan = frame.arrivals.get(arriving);
    expect(plan).toBeDefined();
    expect(frameOf(state, T0 + 5100, held).arrivals.get(arriving)).toBe(plan);
    expect(held.arrivals.size).toBe(1);

    frameOf(EMPTY_SQUAD, T0 + 9000, held);
    expect(held.arrivals.size).toBe(0);
  });

  it('gives a leaving member the plain way out it was planned, and no hand-over without one', () => {
    const seated = run(EMPTY_SQUAD, squads(member(1)), T0);
    const leaving = run(seated, squads(member(1, { status: 'finished' })), T0 + 60_000);
    const gone = leaving.members[`${SUP}:sub:a1`];
    expect(gone?.phase).toBe('leaving');
    const held = plans();
    const noPlan = frameOf(leaving, T0 + 60_000, held);
    expect(noPlan.leaves.size).toBe(0);
    expect(noPlan.handovers.size).toBe(0);
    const seat = frameOf(seated, T0 + 1000).seats[0]!;
    const chair = { x: seat.x, z: seat.z };
    const leave = planLeave(gridFor(layout, seat.floor, [seat], chair), chair, 0);
    held.leaves.set(`${SUP}:sub:a1@${gone?.since}`, leave);
    expect(frameOf(leaving, T0 + 60_000, held).leaves.get(`${SUP}:sub:a1`)).toBe(leave);
  });
});

describe('what a squad frame is rebuilt for', () => {
  it('has a signature that changes with a member phase and not with the clock alone', () => {
    const seated = run(EMPTY_SQUAD, squads(member(1)), T0);
    expect(signatureOf(seated, T0 + 1000)).toBe(signatureOf(seated, T0 + 2000));
    const leaving = run(seated, squads(member(1, { status: 'finished' })), T0 + 60_000);
    expect(signatureOf(leaving, T0 + 60_000)).not.toBe(signatureOf(seated, T0 + 60_000));
  });

  it('reports who joined and who left, once', () => {
    const first = run(EMPTY_SQUAD, squads(member(1)), T0);
    const joined = run(first, squads(member(1), member(2, { startedAt: T0 + 5000 })), T0 + 5000);
    expect(eventsOf(first, joined, T0 + 5000)).toEqual([
      { kind: 'joined', member: `${SUP}:sub:a2`, supervisor: SUP, type: 'Explore', at: T0 + 5000 },
    ]);
    expect(eventsOf(joined, joined, T0 + 5100)).toEqual([]);
    const left = run(joined, squads(member(1, { status: 'finished' }), member(2)), T0 + 60_000);
    expect(eventsOf(joined, left, T0 + 60_000).map((e) => e.kind)).toContain('left');
  });
});
