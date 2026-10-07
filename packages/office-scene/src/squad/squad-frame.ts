// What a squad frame is made of: the zones and pod seats the state implies, the walks planned for who is arriving or
// leaving, and the signature that says when the frame has to be rebuilt.
import type { Layout } from '@aether/contracts';
import { buildNavGrid, type Point } from '@aether/kernel';
import type { Quality } from '../scene-types.js';
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

/** The nav grid of a floor with the pods other than the walker's own in the way. */
export const gridFor = (layout: Layout, floor: number, seats: readonly PodSeat[], chair: Point) =>
  blockPods(
    buildNavGrid(layout.objects.filter((o) => (o.floor ?? 0) === floor)),
    seats.filter((s) => s.floor === floor),
    chair,
  );

/** Something that happened in a squad, for the text equivalent of the scene. */
export type SquadEvent = {
  kind: 'joined' | 'left';
  member: string;
  supervisor: string;
  type: string;
  at: number;
};

export type SquadFrame = {
  /** What the layers draw, per squad (see squad-draw.ts). */
  squads: readonly DrawSquad[];
  /** The page's layout plus a desk-like seat for every subagent in a pod: what the scene looks seats up in. */
  layout: Layout;
  zones: readonly PlacedZone[];
  seats: readonly PodSeat[];
  members: readonly SquadMemberState[];
  arrivals: ReadonlyMap<string, Arrival>;
  leaves: ReadonlyMap<string, Leave>;
  /** Members that finished and walk their result to the supervisor's desk on their way out (instead of a plain leave). */
  handovers: ReadonlyMap<string, HandoverPlan>;
  /** The hand-overs in progress and the in-trays (see handover/): the layer that draws them reads it every frame. */
  handover: HandoverRuntime;
  /** The live state, for the renderers' own per-frame reads (the rate, who works). */
  state: { readonly current: SquadState };
};

export type View = { state: SquadState; now: number; version: number };

/** The walks planned so far, by member and moment (`id@since`): a plan is made once and kept while its member is in the squad. */
export type Plans = { arrivals: Map<string, Arrival>; leaves: Map<string, Leave> };

/** What a frame has to be rebuilt for: who is where, in which phase and doing what, and the zones' sizes. */
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

/** The walk in to each arriving member's pod seat: planned when it first arrives and kept for as long as it does. */
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

/** How each leaving member goes: carrying its result to the supervisor's desk, or by the plain way out. */
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

/** Plans for members that are no longer in the squad are dropped. */
function forgetGone(members: readonly SquadMemberState[], plans: Plans) {
  const live = new Set(members.map((m) => `${m.id}@${m.since}`));
  for (const plan of [plans.arrivals, plans.leaves])
    for (const key of plan.keys()) if (!live.has(key)) plan.delete(key);
}

/** The frame the layers draw: zones and pod seats from the state, with the walks of whoever arrives or leaves. */
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
