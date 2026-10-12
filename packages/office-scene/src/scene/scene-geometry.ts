import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { EXPLODED_GAP, FLOOR_HEIGHT } from '../environment/building.js';
import { FLOORS } from '../environment/layout.js';

const FIRST_DEPARTMENT = DEPARTMENTS[0];
if (!FIRST_DEPARTMENT) throw new Error('@aether/kernel has no departments');
export const departmentAt = (floor: number): (typeof DEPARTMENTS)[number] =>
  DEPARTMENTS[floor] ?? FIRST_DEPARTMENT;

export const floorOfDesk = (layout: Layout, agentId: string) =>
  layout.objects.find((o) => o.agentId === agentId)?.floor ?? 0;

export const floorY = (floor: number, exploded: boolean) =>
  floor * (FLOOR_HEIGHT + (exploded ? EXPLODED_GAP : 0));
export function fittedOffset(
  offset: [number, number, number],
  aspect: number,
): [number, number, number] {
  const farther = Math.min(2.4, Math.max(1, 1.25 / aspect));
  if (aspect >= 1) return [offset[0] * farther, offset[1] * farther, offset[2] * farther];
  const steeper = 1 + (1 - aspect) * 0.5;
  return [offset[0] * farther * 0.85, offset[1] * farther * steeper, offset[2] * farther * 0.85];
}
export const lookY = (floor: number, exploded: boolean) =>
  exploded ? floorY((FLOORS - 1) / 2, true) : floorY(floor, false);
export const OVERVIEW = (exploded: boolean): [number, number, number] =>
  exploded ? [62, 44, 82] : [30, 34, 44];
export const AGENT_OFFSET: [number, number, number] = [3.4, 3.0, 4.6];
export const FOLLOW_OFFSET: [number, number, number] = [3.2, 2.9, 4.4];
export const ZONE_OFFSET: [number, number, number] = [14, 12, 17];

export const ACTIVE: readonly Agent['activity'][] = [
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
];
