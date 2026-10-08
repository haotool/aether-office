import type { Agent } from '@aether/contracts';
import { PULSE_WINDOW_MS, type Pulse, type Seat } from './director.js';
import type { BranchInfo } from '../scene/scene-types.js';
import { toWorld, type V3 } from '../core/shot-camera.js';

// Pure geometry and timing for how members react to each other: who turns toward whom, when the envelope lands and the
// receiver nods, which members share a thread, how lines fade with distance. Drawing is in Poser.tsx, CommLinks.tsx and
// RelationLines.tsx.

/** A seated member can turn this far from facing its screen (radians): a glance at a neighbour, not a swivel of the chair. */
export const MAX_TURN = 0.5;
/** How long the envelope takes from the sender's head to the receiver's. */
export const ENVELOPE_MS = 1800;
/** A member stays turned toward its partner this long after the message, easing in and out. */
const ENGAGE_MS = 9000;
const EASE_IN_MS = 400;
const EASE_OUT_MS = 1200;
const NOD_MS = 700;

const TAU = Math.PI * 2;
export const wrapAngle = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/**
 * How far a member at `seat` turns (radians, added to its facing) to look at the one at `partner`, clamped to
 * `maxTurn`. A member faces its screen along its desk's local -z, which the desk's rotation turns about the vertical.
 */
export function turnToward(seat: Seat, partner: Seat, maxTurn = MAX_TURN): number {
  const heading = (seat.rotation * Math.PI) / 2;
  const wanted = Math.atan2(-(partner.x - seat.x), -(partner.z - seat.z));
  const turn = wrapAngle(wanted - heading);
  return Math.max(-maxTurn, Math.min(maxTurn, turn));
}

/** 0 to 1: how far into turning toward the partner a member is, `age` ms after the message. */
export function engagement(age: number): number {
  if (age < 0 || age > ENGAGE_MS + EASE_OUT_MS) return 0;
  if (age < EASE_IN_MS) return age / EASE_IN_MS;
  if (age <= ENGAGE_MS) return 1;
  return 1 - (age - ENGAGE_MS) / EASE_OUT_MS;
}

/** 0 to 1: how far the envelope has travelled, `age` ms after the message (eased: it leaves briskly and settles in). */
export function envelopeProgress(age: number): number {
  const t = Math.min(1, Math.max(0, age / ENVELOPE_MS));
  return t * t * (3 - 2 * t);
}

/** The receiver's nod as a bob in radians: two dips just after the envelope lands, none before or after. */
export function nodPitch(age: number): number {
  const t = age - ENVELOPE_MS;
  if (t < 0 || t > NOD_MS) return 0;
  return 0.09 * Math.sin((t / NOD_MS) * Math.PI * 2) ** 2 * (1 - t / NOD_MS);
}

export type Engagement = { partner: Seat; at: number; receives: boolean };

/**
 * Who is turned toward whom: both ends of a message on the same floor, and the subagent (only) toward its parent.
 * Newest first, so a member in two exchanges follows the latest.
 */
export function engagementsOf(
  pulses: readonly Pulse[],
  seats: ReadonlyMap<string, Seat>,
  isLive: (pulse: Pulse) => boolean,
): Map<string, Engagement[]> {
  const out = new Map<string, Engagement[]>();
  const add = (id: string, engagement: Engagement) =>
    out.set(id, [...(out.get(id) ?? []), engagement]);
  for (const pulse of [...pulses].sort((a, b) => b.at - a.at)) {
    const from = seats.get(pulse.from);
    const to = seats.get(pulse.to);
    if (!from || !to || from.floor !== to.floor || pulse.from === pulse.to || !isLive(pulse))
      continue;
    add(pulse.to, { partner: from, at: pulse.at, receives: pulse.kind !== 'sub' });
    if (pulse.kind !== 'sub') add(pulse.from, { partner: to, at: pulse.at, receives: false });
  }
  return out;
}

/** Members who share a thread with the focused one: the same group (repository, else branch), same floor, nearest first. */
export function threadPeers(
  focus: string,
  groupOf: ReadonlyMap<string, string>,
  seats: ReadonlyMap<string, Seat>,
  limit = 6,
): string[] {
  const group = groupOf.get(focus);
  const here = seats.get(focus);
  if (!group || !here) return [];
  const distance = (s: Seat) => Math.hypot(s.x - here.x, s.z - here.z);
  return [...groupOf]
    .flatMap(([id, g]) => {
      const seat = seats.get(id);
      return g === group && id !== focus && seat?.floor === here.floor
        ? [{ id, away: distance(seat) }]
        : [];
    })
    .sort((a, b) => a.away - b.away)
    .slice(0, limit)
    .map((near) => near.id);
}

/** 1 up close, down to 0 far away: faint lines and links dissolve with distance from the camera instead of cluttering. */
export function distanceFade(distance: number, near = 30, far = 110): number {
  return Math.min(1, Math.max(0, (far - distance) / (far - near)));
}

export type Edge = { a: V3; b: V3; kind: 'thread' | 'tether'; strength: number };

/** The lines to draw between desks: a thread to each peer of the focused member, a tether from each parent to its subagents. */
export function relationEdges({
  focus,
  groupOf,
  tethers,
  seats,
  heightOf,
  visible,
}: {
  focus: string | null;
  groupOf: ReadonlyMap<string, string>;
  tethers: readonly { parent: string; child: string }[];
  seats: ReadonlyMap<string, Seat>;
  heightOf: (floor: number) => number;
  visible: (floor: number) => boolean;
}): Edge[] {
  const at = (id: string): V3 | null => {
    const seat = seats.get(id);
    if (!seat || !visible(seat.floor)) return null;
    const p = toWorld(seat, [0, 0, 0.86], 0);
    return [p[0], heightOf(seat.floor) + 1.15, p[2]];
  };
  const edges: Edge[] = [];
  for (const { parent, child } of tethers) {
    const a = at(parent);
    const b = at(child);
    if (a && b)
      edges.push({ a, b, kind: 'tether', strength: focus === parent || focus === child ? 1 : 0.4 });
  }
  const from = focus ? at(focus) : null;
  if (focus && from)
    for (const id of threadPeers(focus, groupOf, seats)) {
      const to = at(id);
      if (to) edges.push({ a: from, b: to, kind: 'thread', strength: 1 });
    }
  return edges;
}

/** What the scene draws of how members relate right now: who turns toward whom, and the lines between desks. */
export function sceneRelations({
  pulses,
  seats,
  agents,
  branchOf,
  tethers,
  focus,
  heightOf,
  visible,
  now = Date.now(),
}: {
  pulses: readonly Pulse[];
  seats: ReadonlyMap<string, Seat>;
  agents: readonly Agent[];
  branchOf: ((agent: Agent) => BranchInfo | null) | undefined;
  tethers: readonly { parent: string; child: string }[];
  focus: string | null;
  heightOf: (floor: number) => number;
  visible: (floor: number) => boolean;
  now?: number;
}) {
  const engagements = engagementsOf(
    pulses,
    seats,
    (p) => now - p.at <= PULSE_WINDOW_MS && now - p.at >= -5000,
  );
  const groupOf = new Map<string, string>();
  for (const agent of agents) {
    const info = branchOf?.(agent);
    const group = info?.repo ?? info?.branch;
    if (group) groupOf.set(agent.id, group);
  }
  return {
    engagements,
    edges: relationEdges({ focus, groupOf, tethers, seats, heightOf, visible }),
  };
}
