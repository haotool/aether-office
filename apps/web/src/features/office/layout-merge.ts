import type { Agent, Layout } from '@aether/contracts';
import {
  FLOOR_CAPACITY,
  defaultLayout,
  floorsFrom,
  placeSquads,
  seatAt,
  type Seat,
  type SquadRect,
} from '@aether/office-scene/model';
import { SUBAGENT_INFIX, parentOf } from '../../lib/sessions/subagent-id.js';

type MergeOptions = {
  /**
   * Seat subagents in their supervisor's squad zone instead of at desks of their own: a subagent whose zone fits beside
   * its parent gets no desk (the zone seats it); one whose zone does not fit keeps a desk, as before squads existed.
   */
  squads?: boolean;
  /** Desks the members already have (`assignSeats`): with no saved layout they keep them whatever order they arrive in. */
  seats?: ReadonlyMap<string, Seat>;
};

type SeatMember = (agent: Agent) => void;

/** Seats a member at the first free slot of its floor, spilling to the next floor with a free desk; remembers what it placed. */
function seater(base: Layout, floorOf: (agent: Agent) => number) {
  const added: Layout['objects'] = [];
  const zones: SquadRect[] = [];
  const next = new Map<number, number>();
  const taken = (floor: number, x: number, z: number) =>
    [...base.objects, ...added].some(
      (o) => (o.floor ?? 0) === floor && Math.abs(o.x - x) < 2.4 && Math.abs(o.z - z) < 2.2,
    ) ||
    zones.some(
      (r) =>
        r.floor === floor &&
        Math.abs(r.x - x) < r.width / 2 + 1.1 &&
        Math.abs(r.z - z) < r.depth / 2 + 0.9,
    );
  const seat: SeatMember = (agent) => {
    for (const floor of floorsFrom(floorOf(agent))) {
      let slot = next.get(floor) ?? 0;
      while (slot < FLOOR_CAPACITY && taken(floor, ...seatAt(slot))) slot++;
      if (slot >= FLOOR_CAPACITY) continue;
      next.set(floor, slot + 1);
      const [x, z] = seatAt(slot);
      added.push({
        id: `desk-obs-${floor}-${slot}`,
        type: 'desk',
        x,
        z,
        rotation: 0,
        agentId: agent.id,
        floor,
      });
      break;
    }
  };
  return { added, zones, seat };
}

/** One zone per supervisor, placed with the others already on the floor; what has no zone is seated as before. */
function zoneSquads(
  base: Layout,
  added: Layout['objects'],
  zones: SquadRect[],
  subs: ReadonlySet<Agent>,
  seat: SeatMember,
) {
  const desks = [...base.objects, ...added].filter((o) => o.type === 'desk');
  const counts = new Map<string, number>();
  for (const agent of subs)
    counts.set(parentOf(agent.id), (counts.get(parentOf(agent.id)) ?? 0) + 1);
  const requests = [...counts].flatMap(([parent, count]) => {
    const desk = desks.find((o) => o.agentId === parent);
    return desk ? [{ deskId: desk.id, count }] : [];
  });
  const placed = placeSquads({ ...base, objects: [...base.objects, ...added] }, requests);
  for (const rect of placed.values()) if (rect) zones.push(rect);
  const zoned = new Set(
    requests
      .filter((r) => placed.get(r.deskId))
      .flatMap((r) => {
        const desk = desks.find((o) => o.id === r.deskId);
        return desk?.agentId ? [desk.agentId] : [];
      }),
  );
  for (const agent of subs) if (!zoned.has(parentOf(agent.id))) seat(agent);
}

/**
 * Seats every agent the saved layout has no desk for, on the agent's own floor (the next one with room when it is full), in the first free slot. A saved
 * layout is never rearranged. With no saved layout the whole building is generated.
 */
export function mergeLayout(
  layout: Layout | null,
  managed: readonly Agent[],
  extra: readonly Agent[],
  floorOf: (agent: Agent) => number = () => 0,
  options: MergeOptions = {},
): Layout | null {
  const all = [...managed, ...extra];
  const subs = new Set(options.squads ? all.filter((a) => a.id.includes(SUBAGENT_INFIX)) : []);
  const base =
    layout ??
    (extra.length
      ? defaultLayout(
          all.filter((a) => !subs.has(a)),
          floorOf,
          options.seats,
        )
      : null);
  if (!base) return null;
  const seated = new Set(base.objects.flatMap((o) => (o.agentId ? [o.agentId] : [])));
  const { added, zones, seat } = seater(base, floorOf);
  for (const agent of all) if (!subs.has(agent) && !seated.has(agent.id)) seat(agent);
  if (subs.size) zoneSquads(base, added, zones, subs, seat);
  return added.length ? { ...base, objects: [...base.objects, ...added] } : base;
}
