import type { Agent } from '@aether/contracts';
import { PULSE_WINDOW_MS, type Pulse, type Seat } from './director.js';
import type { BranchInfo } from '../scene/scene-types.js';
import { toWorld, type V3 } from '../core/shot-camera.js';

export const MAX_TURN = 0.5;
export const ENVELOPE_MS = 1800;
const ENGAGE_MS = 9000;
const EASE_IN_MS = 400;
const EASE_OUT_MS = 1200;
const NOD_MS = 700;

const TAU = Math.PI * 2;
export const wrapAngle = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

export function turnToward(seat: Seat, partner: Seat, maxTurn = MAX_TURN): number {
  const heading = (seat.rotation * Math.PI) / 2;
  const wanted = Math.atan2(-(partner.x - seat.x), -(partner.z - seat.z));
  const turn = wrapAngle(wanted - heading);
  return Math.max(-maxTurn, Math.min(maxTurn, turn));
}

export function engagement(age: number): number {
  if (age < 0 || age > ENGAGE_MS + EASE_OUT_MS) return 0;
  if (age < EASE_IN_MS) return age / EASE_IN_MS;
  if (age <= ENGAGE_MS) return 1;
  return 1 - (age - ENGAGE_MS) / EASE_OUT_MS;
}

export function envelopeProgress(age: number): number {
  const t = Math.min(1, Math.max(0, age / ENVELOPE_MS));
  return t * t * (3 - 2 * t);
}

export function nodPitch(age: number): number {
  const t = age - ENVELOPE_MS;
  if (t < 0 || t > NOD_MS) return 0;
  return 0.09 * Math.sin((t / NOD_MS) * Math.PI * 2) ** 2 * (1 - t / NOD_MS);
}

export type Engagement = { partner: Seat; at: number; receives: boolean };

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

export function distanceFade(distance: number, near = 30, far = 110): number {
  return Math.min(1, Math.max(0, (far - distance) / (far - near)));
}

export type Edge = { a: V3; b: V3; kind: 'thread' | 'tether'; strength: number };

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
