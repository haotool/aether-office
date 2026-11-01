import { describe, expect, it } from 'vitest';
import {
  ARRIVE_MS,
  EMPTY_SQUAD,
  LINGER_MS,
  POD_FREE_MS,
  SHRINK_AFTER_MS,
  membersOf,
  stepSquad,
  type SquadInput,
  type SquadMemberInput,
  type SquadState,
} from '../../packages/office-scene/src/squad/squad-model.js';
import { beamIntensity, beamRate } from '../../packages/office-scene/src/squad/beam-rate.js';

const SUP = 'local:s1';
const T0 = 1_000_000;
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
const leaveMs = () => 8000;
const run = (state: SquadState, input: SquadInput[], now: number) =>
  stepSquad(state, { squads: input, leaveMs }, now);
const seatOf = (state: SquadState, n: number) => state.members[`${SUP}:sub:a${n}`]?.seat;

describe('seating', () => {
  it('seats whoever is there at the first look, without a walk', () => {
    const state = run(EMPTY_SQUAD, squads(member(1), member(2), member(3)), T0 + 1000);
    expect(Object.values(state.members).map((m) => m.phase)).toEqual([
      'seated',
      'seated',
      'seated',
    ]);
    expect(membersOf(state, SUP).map((m) => m.seat)).toEqual([0, 1, 2]);
    expect(state.zones[SUP]?.seats).toBe(3);
  });

  it('walks in a new subagent, and seats it when the arrival is over', () => {
    let state = run(EMPTY_SQUAD, squads(member(1)), T0);
    state = run(state, squads(member(1), member(2, { startedAt: T0 + 5000 })), T0 + 5000);
    expect(state.members[`${SUP}:sub:a2`]).toMatchObject({ phase: 'arriving', seat: 1 });
    state = run(
      state,
      squads(member(1), member(2, { startedAt: T0 + 5000 })),
      T0 + 5000 + ARRIVE_MS,
    );
    expect(state.members[`${SUP}:sub:a2`]?.phase).toBe('seated');
  });

  it('seats a subagent that was running long before it was first seen', () => {
    let state = run(EMPTY_SQUAD, squads(member(1)), T0);
    state = run(state, squads(member(1), member(2, { startedAt: T0 - 120_000 })), T0 + 1000);
    expect(state.members[`${SUP}:sub:a2`]?.phase).toBe('seated');
  });

  it('never reorders: a seat is kept while held, and the lowest free one is given next', () => {
    let state = run(EMPTY_SQUAD, squads(member(1), member(2), member(3)), T0);
    const dropped = T0 + 1000;
    const freed = dropped + LINGER_MS + POD_FREE_MS;
    state = run(state, squads(member(1), member(3)), dropped);
    expect([seatOf(state, 1), seatOf(state, 3)]).toEqual([0, 2]);
    const stays = squads(member(1), member(3), member(4, { startedAt: T0 + 2000 }));
    state = run(state, stays, T0 + 2000);
    expect(seatOf(state, 4)).toBe(3);
    state = run(state, stays, dropped + LINGER_MS);
    state = run(state, stays, freed);
    state = run(
      state,
      squads(
        member(1),
        member(3),
        member(4, { startedAt: T0 + 2000 }),
        member(5, { startedAt: freed }),
      ),
      freed,
    );
    expect(seatOf(state, 5)).toBe(1);
    expect([seatOf(state, 1), seatOf(state, 3), seatOf(state, 4)]).toEqual([0, 2, 3]);
  });
});

describe('leaving', () => {
  const second = `${SUP}:sub:a2`;
  const finished = () => squads(member(1), member(2, { status: 'finished' }));

  it('lets a finished subagent sit through the linger, then sends it out through the core and forgets it', () => {
    let state = run(EMPTY_SQUAD, squads(member(1), member(2)), T0);
    state = run(state, finished(), T0 + 1000);
    expect(state.members[second]).toMatchObject({
      phase: 'seated',
      working: false,
      finishedAt: T0 + 1000,
    });
    state = run(state, finished(), T0 + 1000 + LINGER_MS - 250);
    expect(state.members[second]?.phase).toBe('seated');
    const left = T0 + 1000 + LINGER_MS;
    state = run(state, finished(), left);
    expect(state.members[second]).toMatchObject({
      phase: 'leaving',
      since: left,
      until: left + 8000,
    });
    state = run(state, finished(), left + 8000);
    expect(state.members[second]).toBeUndefined();
    state = run(state, finished(), left + 20_000);
    expect(state.members[second]).toBeUndefined();
  });

  it('never stands up for a subagent that runs again before the linger is over', () => {
    let state = run(EMPTY_SQUAD, squads(member(1), member(2)), T0);
    state = run(state, finished(), T0 + 1000);
    state = run(state, squads(member(1), member(2)), T0 + 1000 + LINGER_MS - 250);
    expect(state.members[second]).toMatchObject({ phase: 'seated', finishedAt: null });
    state = run(state, finished(), T0 + 1000 + LINGER_MS);
    expect(state.members[second]).toMatchObject({
      phase: 'seated',
      finishedAt: T0 + 1000 + LINGER_MS,
    });
    state = run(state, finished(), T0 + 1000 + 2 * LINGER_MS);
    expect(state.members[second]?.phase).toBe('leaving');
  });

  it('treats a subagent that drops out of the facts like a finished one', () => {
    let state = run(EMPTY_SQUAD, squads(member(1), member(2)), T0);
    state = run(state, squads(member(1)), T0 + 1000);
    expect(state.members[second]).toMatchObject({ phase: 'seated', finishedAt: T0 + 1000 });
    state = run(state, squads(member(1), member(2)), T0 + 1000 + LINGER_MS - 250);
    expect(state.members[second]).toMatchObject({ phase: 'seated', finishedAt: null });
    state = run(state, squads(member(1)), T0 + 2000 + LINGER_MS);
    state = run(state, squads(member(1)), T0 + 2000 + 2 * LINGER_MS);
    expect(state.members[second]?.phase).toBe('leaving');
  });

  it('does not seat a subagent that is already finished when first seen', () => {
    const state = run(EMPTY_SQUAD, squads(member(1, { status: 'finished' })), T0);
    expect(Object.keys(state.members)).toEqual([]);
  });
});

describe('the zone', () => {
  it('grows at once and shrinks only after ten quiet seconds with no walk in flight', () => {
    let state = run(EMPTY_SQUAD, squads(member(1), member(2), member(3), member(4)), T0);
    expect(state.zones[SUP]?.seats).toBe(4);
    const rest = squads(member(1), member(2));
    const seatsAt = (from: number, to: number) => {
      for (let t = from; t <= to; t += 250) state = run(state, rest, T0 + t);
      return state.zones[SUP]?.seats;
    };
    expect(seatsAt(1000, 8000)).toBe(4);
    const needed = 1000 + LINGER_MS + POD_FREE_MS - 250;
    expect(seatsAt(8250, needed + SHRINK_AFTER_MS - 250)).toBe(4);
    expect(seatsAt(needed + SHRINK_AFTER_MS, needed + SHRINK_AFTER_MS + 250)).toBe(2);
  });

  it('goes away ten seconds after the last member left', () => {
    const left = T0 + 1000 + LINGER_MS;
    let state = run(EMPTY_SQUAD, squads(member(1)), T0);
    state = run(state, [], T0 + 1000);
    state = run(state, [], left);
    state = run(state, [], left + 8000);
    expect(state.zones[SUP]).toBeDefined();
    state = run(state, [], left + 8000 + SHRINK_AFTER_MS);
    expect(state.zones[SUP]).toBeUndefined();
  });

  it('is deterministic', () => {
    const a = run(EMPTY_SQUAD, squads(member(1), member(2)), T0);
    const b = run(EMPTY_SQUAD, squads(member(1), member(2)), T0);
    expect(a).toEqual(b);
  });
});

describe('the beam', () => {
  it("counts tool starts in the last minute as the beam's fallback rate and burns brighter for more", () => {
    let state = run(EMPTY_SQUAD, squads(member(1, { toolCount: 2 })), T0);
    expect(beamRate(state.zones[SUP], T0)).toEqual({ source: 'tools', perMinute: 0 });
    state = run(state, squads(member(1, { toolCount: 3, lastSeen: T0 + 5000 })), T0 + 5000);
    state = run(state, squads(member(1, { toolCount: 4, lastSeen: T0 + 9000 })), T0 + 9000);
    expect(beamRate(state.zones[SUP], T0 + 9000)).toEqual({ source: 'tools', perMinute: 2 });
    expect(beamRate(state.zones[SUP], T0 + 70_000).perMinute).toBe(0);
    const tools = (perMinute: number) => beamIntensity({ source: 'tools', perMinute });
    expect(tools(0)).toBe(0);
    expect(tools(2)).toBeLessThan(tools(12));
  });

  it('marks who works and who waits', () => {
    const state = run(
      EMPTY_SQUAD,
      squads(
        member(1, { lastSeen: T0 }),
        member(2, { status: 'waiting_permission', lastSeen: T0 - 60_000 }),
      ),
      T0 + 1000,
    );
    expect(state.members[`${SUP}:sub:a1`]).toMatchObject({ working: true, waiting: false });
    expect(state.members[`${SUP}:sub:a2`]).toMatchObject({ working: false, waiting: true });
  });
});
