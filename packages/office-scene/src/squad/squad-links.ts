import { SQUAD_PITCH } from '@aether/kernel';
import { SEAT_DEPTH } from '../animals/departure.js';
import type { DrawSquad } from './squad-draw.js';
import type { Point2 } from './squad-glide.js';

export type Segment = { from: Point2; to: Point2 };
type Port = Segment & { member: string };
export type Trace = { member: string; route: readonly Point2[] };
export type LinkLayout = { segments: Segment[]; ports: Port[]; traces: Trace[] };

type LinkSource = Pick<DrawSquad, 'deskX' | 'deskZ' | 'podRotation' | 'pods'>;

export const AISLE = 0.45;
export const PORT = 0.22;
const PORT_HALF_WIDTH = 0.55;
const EPSILON = 1e-6;
const rounded = (n: number) => Math.round(n * 1000) / 1000;

function aisleBetween(columns: readonly number[]): number {
  const half = SQUAD_PITCH / 2;
  const free = (v: number) => columns.every((c) => Math.abs(c - v) > half - EPSILON);
  const aisles = [0, ...columns.flatMap((c) => [c - half, c + half])].map(rounded).filter(free);
  return aisles.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)[0] ?? 0;
}

export function linkLayout(s: LinkSource): LinkLayout {
  const yaw = (s.podRotation * Math.PI) / 2;
  const ahead = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const across = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const at = (u: number, v: number): Point2 => ({
    x: s.deskX + ahead.x * u + across.x * v,
    z: s.deskZ + ahead.z * u + across.z * v,
  });
  const pods = s.pods.map((pod) => {
    const dx = pod.x - ahead.x * SEAT_DEPTH - s.deskX;
    const dz = pod.z - ahead.z * SEAT_DEPTH - s.deskZ;
    return {
      member: pod.member,
      u: Math.max(0, dx * ahead.x + dz * ahead.z),
      v: rounded(dx * across.x + dz * across.z),
    };
  });
  const lane = aisleBetween(pods.map(({ v }) => v));
  const desks = pods.flatMap(({ member, u, v }) =>
    member ? [{ member, aisle: Math.max(0, u - AISLE), front: Math.max(0, u - PORT), v }] : [],
  );
  const rows = new Map<number, { min: number; max: number }>();
  for (const { aisle, v } of desks) {
    const row = rows.get(rounded(aisle)) ?? { min: lane, max: lane };
    rows.set(rounded(aisle), { min: Math.min(row.min, v), max: Math.max(row.max, v) });
  }
  const reach = Math.max(0, ...rows.keys());
  const trunk = reach > EPSILON ? [{ from: at(0, lane), to: at(reach, lane) }] : [];
  const bars = [...rows]
    .filter(([, row]) => row.max - row.min > EPSILON)
    .map(([aisle, row]) => ({ from: at(aisle, row.min), to: at(aisle, row.max) }));
  return {
    segments: [...trunk, ...bars],
    ports: desks.map(({ member, front, v }) => ({
      member,
      from: at(front, v - PORT_HALF_WIDTH),
      to: at(front, v + PORT_HALF_WIDTH),
    })),
    traces: desks.map(({ member, aisle, front, v }) => ({
      member,
      route:
        Math.abs(v - lane) > EPSILON
          ? [at(0, lane), at(aisle, lane), at(aisle, v), at(front, v)]
          : [at(0, lane), at(front, v)],
    })),
  };
}
