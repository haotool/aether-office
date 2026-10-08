// What the squad layers draw, worked out once per change of the frame: one entry per squad with its zone, its pods and
// the supervisor's desk. Pure; the layers add the clock (the glide, the beam's brightness) on top.
import type { Layout } from '@aether/contracts';
import { SEAT_DEPTH } from '../animals/departure.js';
import { departmentAt } from '../scene/scene-geometry.js';
import { handoverSide } from './handover/plan.js';
import type { SquadMemberState } from './squad-model.js';
import type { PlacedZone, PodSeat } from './squad-seats.js';

type DrawPod = {
  x: number;
  z: number;
  /** The member sitting here, if any. */
  member: string | null;
  /** Past the character budget: drawn as a silhouette, not as an animated character. */
  silhouette: boolean;
  /** When it took the seat (the pod unfolds from then). */
  since: number;
};
export type DrawSquad = {
  supervisor: string;
  floor: number;
  /** The zone, in world extents. */
  x: number;
  z: number;
  width: number;
  depth: number;
  pods: readonly DrawPod[];
  /** The supervisor's chair, and the quarter turns of its desk. */
  chairX: number;
  chairZ: number;
  deskX: number;
  deskZ: number;
  deskRotation: number;
  /** The end of the desk the in-tray and the stamp sit at (+1 is the desk's +x): the one nearest the zone. */
  side: 1 | -1;
  accent: string;
  /** Members past the character budget or the zone's last pod: silhouettes, or only counted. */
  overflow: number;
};

/** Heads shown as animated characters per squad, by tier: the rest are silhouettes (the spec's character budget). */
export const CHARACTER_BUDGET = { high: 8, balanced: 6, low: 4 } as const;

type SquadFrame = {
  zones: readonly PlacedZone[];
  seats: readonly PodSeat[];
  members: readonly SquadMemberState[];
};

/** One zone: its pods (a member past the character budget is a silhouette), the chair and desk it faces and who overflows. */
function drawZone(
  frame: SquadFrame,
  zone: PlacedZone,
  desk: Layout['objects'][number],
  budget: number,
): DrawSquad {
  const seated = new Set(frame.seats.map((s) => s.member));
  const held = new Map(
    frame.members
      .filter((m) => seated.has(m.id))
      .map((m) => [m.seat + ':' + m.supervisor, m] as const),
  );
  const pods = zone.pods.map((pod) => {
    const m = held.get(pod.index + ':' + zone.supervisor);
    return {
      x: pod.x,
      z: pod.z,
      member: m?.id ?? null,
      silhouette: !!m && m.seat >= budget,
      since: m?.since ?? 0,
    };
  });
  const yaw = (desk.rotation * Math.PI) / 2;
  return {
    supervisor: zone.supervisor,
    floor: zone.rect.floor,
    x: zone.rect.x,
    z: zone.rect.z,
    width: zone.rect.width,
    depth: zone.rect.depth,
    pods,
    chairX: desk.x + SEAT_DEPTH * Math.sin(yaw),
    chairZ: desk.z + SEAT_DEPTH * Math.cos(yaw),
    deskX: desk.x,
    deskZ: desk.z,
    deskRotation: desk.rotation,
    side: handoverSide(desk, zone.rect),
    accent: departmentAt(zone.rect.floor).accent,
    overflow: frame.members.filter(
      (m) =>
        m.supervisor === zone.supervisor &&
        m.phase !== 'leaving' &&
        (m.seat >= budget || !frame.seats.some((s) => s.member === m.id)),
    ).length,
  };
}

export function drawSquads(frame: SquadFrame, base: Layout, budget: number): DrawSquad[] {
  return frame.zones.flatMap((zone) => {
    const desk = base.objects.find((o) => o.type === 'desk' && o.agentId === zone.supervisor);
    return desk ? [drawZone(frame, zone, desk, budget)] : [];
  });
}
