import type { Layout } from '@aether/contracts';
import { buildNavGrid, type Point } from '@aether/kernel';
import type { Quality } from '../scene/scene-types.js';
import { blockPods, planArrival, type Arrival, type Leave } from './errand.js';
import { occupies, type SquadMemberState, type SquadState } from './squad-model.js';
import { CHARACTER_BUDGET, drawSquads, type DrawSquad } from './squad-draw.js';
import type { HandoverRuntime, HandoverPlan } from './handover/index.js';
import {
  placeZones,
  podSeats,
  withPodSeats,
  type PlacedZone,
  type PodSeat,
} from './squad-seats.js';

export const gridFor = (layout: Layout, floor: number, seats: readonly PodSeat[], chair: Point) =>
  blockPods(
    buildNavGrid(layout.objects.filter((o) => (o.floor ?? 0) === floor)),
    seats.filter((s) => s.floor === floor),
    chair,
  );

export type SquadEvent = {
  kind: 'joined' | 'left';
  member: string;
  supervisor: string;
  type: string;
  at: number;
};

export type SquadFrame = {
  squads: readonly DrawSquad[];
  layout: Layout;
  zones: readonly PlacedZone[];
  seats: readonly PodSeat[];
  members: readonly SquadMemberState[];
  arrivals: ReadonlyMap<string, Arrival>;
  leaves: ReadonlyMap<string, Leave>;
  handovers: ReadonlyMap<string, HandoverPlan>;
  handover: HandoverRuntime;
  state: { readonly current: SquadState };
};

export type View = { state: SquadState; now: number; version: number };

export type Plans = { arrivals: Map<string, Arrival>; leaves: Map<string, Leave> };

export const signatureOf = (s: SquadState, now: number) =>
  Object.values(s.members)
    .map(
      (m) =>
        `${m.id}:${m.seat}:${m.phase}:${m.since}:${occupies(m, now)}:${+m.working}${+m.waiting}`,
    )
    .sort()
    .join('|') +
  '#' +
  Object.entries(s.zones)
    .map(([k, z]) => `${k}:${z.seats}`)
    .sort()
    .join('|');

export function eventsOf(prev: SquadState, next: SquadState, now: number): SquadEvent[] {
  const out: SquadEvent[] = [];
  for (const m of Object.values(next.members)) {
    const before = prev.members[m.id];
    const joined = !before && m.phase === 'arriving';
    const left = m.phase === 'leaving' && before?.phase !== 'leaving';
    if (joined || left)
      out.push({
        kind: joined ? 'joined' : 'left',
        member: m.id,
        supervisor: m.supervisor,
        type: m.type,
        at: now,
      });
  }
  return out;
}

function arrivalsOf(
  members: readonly SquadMemberState[],
  seats: readonly PodSeat[],
  layout: Layout,
  plans: Plans,
  quality: Quality,
  reducedMotion: boolean,
) {
  const arrivals = new Map<string, Arrival>();
  for (const m of members) {
    const seat = seats.find((s) => s.member === m.id);
    if (m.phase !== 'arriving' || !seat) continue;
    const key = `${m.id}@${m.since}`;
    const chair = { x: seat.x, z: seat.z };
    const plan =
      plans.arrivals.get(key) ??
      planArrival(
        gridFor(layout, seat.floor, seats, chair),
        chair,
        (seat.rotation * Math.PI) / 2,
        quality,
        reducedMotion,
      );
    plans.arrivals.set(key, plan);
    arrivals.set(m.id, plan);
  }
  return arrivals;
}

function departuresOf(
  members: readonly SquadMemberState[],
  plans: Plans,
  handover: HandoverRuntime,
) {
  const leaves = new Map<string, Leave>();
  const handovers = new Map<string, HandoverPlan>();
  for (const m of members) {
    if (m.phase !== 'leaving') continue;
    const leave = plans.leaves.get(`${m.id}@${m.since}`);
    const walk = handover.planOf(m.id, m.since);
    if (walk?.mode === 'walk') handovers.set(m.id, walk);
    else if (leave) leaves.set(m.id, leave);
  }
  return { leaves, handovers };
}

function forgetGone(members: readonly SquadMemberState[], plans: Plans) {
  const live = new Set(members.map((m) => `${m.id}@${m.since}`));
  for (const plan of [plans.arrivals, plans.leaves])
    for (const key of plan.keys()) if (!live.has(key)) plan.delete(key);
}

export function buildFrame(o: {
  layout: Layout;
  view: View;
  order: readonly string[];
  quality: Quality;
  reducedMotion: boolean;
  handover: HandoverRuntime;
  plans: Plans;
  state: { readonly current: SquadState };
}): SquadFrame {
  const { layout, view, plans, handover, quality } = o;
  const zones = placeZones(layout, view.state, o.order);
  const seats = podSeats(zones, view.state, view.now);
  const members = Object.values(view.state.members);
  const arrivals = arrivalsOf(members, seats, layout, plans, quality, o.reducedMotion);
  const { leaves, handovers } = departuresOf(members, plans, handover);
  forgetGone(members, plans);
  return {
    squads: drawSquads({ zones, seats, members }, layout, CHARACTER_BUDGET[quality]),
    layout: withPodSeats(layout, seats),
    zones,
    seats,
    members,
    arrivals,
    leaves,
    handovers,
    handover,
    state: o.state,
  };
}
