import type { Layout } from '@aether/contracts';
import { objectBounds, type PlacedObject } from '@aether/kernel';
import { SEAT_DEPTH } from '../animals/departure.js';
import { membersOf, occupies, type SquadState } from './squad-model.js';
import { placeSquads, podsOf, type Pod, type SquadRect } from './squad-layout.js';

export type PlacedZone = {
  supervisor: string;
  rect: SquadRect;
  pods: Pod[];
  rotation: number;
};
export type PodSeat = {
  member: string;
  supervisor: string;
  floor: number;
  x: number;
  z: number;
  rotation: number;
  deskX: number;
  deskZ: number;
};

function facingOf(zone: Pick<SquadRect, 'x' | 'z'>, desk: PlacedObject): number {
  const b = objectBounds(desk);
  const gapX = Math.abs(zone.x - desk.x) - (b.maxX - b.minX) / 2;
  const gapZ = Math.abs(zone.z - desk.z) - (b.maxZ - b.minZ) / 2;
  if (gapX >= gapZ) return zone.x > desk.x ? 1 : 3;
  return zone.z > desk.z ? 0 : 2;
}

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

export const isPodSeat = (o: { id: string }) => o.id.startsWith(POD_SEAT_PREFIX);
const POD_SEAT_PREFIX = 'pod-';

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
