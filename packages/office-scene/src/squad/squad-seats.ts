// Where each subagent sits: the zone of its supervisor, the pod it holds, and that pod as a seat the rest of the scene
// already understands (a desk's chair), so the camera, the name tags and the director find subagents like any member.
import type { Layout } from '@aether/contracts';
import { objectBounds, type PlacedObject } from '@aether/kernel';
import { SEAT_DEPTH } from '../departure.js';
import { membersOf, occupies, type SquadState } from './squad-model.js';
import { placeSquads, podsOf, type Pod, type SquadRect } from './squad-layout.js';

/** A zone as the scene draws it. */
export type PlacedZone = {
  supervisor: string;
  rect: SquadRect;
  pods: Pod[];
  /** The desk's quarter turns that make a pod face the supervisor's desk (the seat's own turn, see `chairOf`). */
  rotation: number;
};
/** A seat in a zone: the pod, and the desk-frame origin that puts a seated member on it. */
export type PodSeat = {
  member: string;
  supervisor: string;
  floor: number;
  /** The pod's centre: where the member sits. */
  x: number;
  z: number;
  rotation: number;
  /** Where a desk would stand for this chair (what `Member` uses as its frame): the pod pulled back by the chair depth. */
  deskX: number;
  deskZ: number;
};

/**
 * The quarter turns that make a member in a zone face the supervisor's desk: the zone lies on one side of the desk, and
 * its pods look back at it. (A desk's frame has the chair at +z, looking at -z.)
 */
function facingOf(zone: Pick<SquadRect, 'x' | 'z'>, desk: PlacedObject): number {
  const b = objectBounds(desk);
  const gapX = Math.abs(zone.x - desk.x) - (b.maxX - b.minX) / 2;
  const gapZ = Math.abs(zone.z - desk.z) - (b.maxZ - b.minZ) / 2;
  if (gapX >= gapZ) return zone.x > desk.x ? 1 : 3; // the zone east of the desk: the pods look west
  return zone.z > desk.z ? 0 : 2;
}

/**
 * The zones the supervisors' squads stand in, placed one after another so no two overlap and none sits on a desk. A
 * supervisor with no desk of its own on the floor, or whose zone does not fit, has none (its subagents keep their desks).
 */
export function placeZones(
  layout: Layout,
  state: SquadState,
  order: readonly string[],
): PlacedZone[] {
  const desks = new Map<string, PlacedObject>();
  for (const o of layout.objects) if (o.type === 'desk' && o.agentId) desks.set(o.agentId, o);
  const wanted = order.flatMap((supervisor) => {
    const desk = desks.get(supervisor);
    const zone = state.zones[supervisor];
    return desk && zone ? [{ supervisor, desk, seats: zone.seats }] : [];
  });
  const placed = placeSquads(
    layout,
    wanted.map((w) => ({ deskId: w.desk.id, count: w.seats })),
  );
  return wanted.flatMap(({ supervisor, desk }) => {
    const rect = placed.get(desk.id);
    return rect ? [{ supervisor, rect, pods: podsOf(rect), rotation: facingOf(rect, desk) }] : [];
  });
}

/** Every seated member's pod seat. A member past the last pod (a saved zone that is too small) has none: it is a silhouette. */
export function podSeats(zones: readonly PlacedZone[], state: SquadState, now: number): PodSeat[] {
  return zones.flatMap((zone) =>
    membersOf(state, zone.supervisor).flatMap((m) => {
      const pod = zone.pods[m.seat];
      if (!pod || !occupies(m, now)) return [];
      const yaw = (zone.rotation * Math.PI) / 2;
      return [
        {
          member: m.id,
          supervisor: zone.supervisor,
          floor: zone.rect.floor,
          x: pod.x,
          z: pod.z,
          rotation: zone.rotation,
          deskX: pod.x - SEAT_DEPTH * Math.sin(yaw),
          deskZ: pod.z - SEAT_DEPTH * Math.cos(yaw),
        },
      ];
    }),
  );
}

/** Whether a layout object is a pod seat (added by `withPodSeats`), not a desk of the floor. */
export const isPodSeat = (o: { id: string }) => o.id.startsWith(POD_SEAT_PREFIX);
const POD_SEAT_PREFIX = 'pod-';

/** The layout with every pod seat added as a desk that has the member's id, so seats are found as they are for a desk. */
export function withPodSeats(layout: Layout, seats: readonly PodSeat[]): Layout {
  if (!seats.length) return layout;
  return {
    ...layout,
    objects: [
      ...layout.objects,
      ...seats.map((s) => ({
        id: `${POD_SEAT_PREFIX}${s.member}`,
        type: 'desk' as const,
        x: s.deskX,
        z: s.deskZ,
        rotation: s.rotation,
        agentId: s.member,
        floor: s.floor,
      })),
    ],
  };
}
