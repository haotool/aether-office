import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { EXPLODED_GAP, FLOOR_HEIGHT } from './building.js';
import { FLOORS } from './layout.js';

const FIRST_DEPARTMENT = DEPARTMENTS[0];
if (!FIRST_DEPARTMENT) throw new Error('@aether/kernel has no departments');
/** The department on a floor; the first one for a floor that has none. */
export const departmentAt = (floor: number): (typeof DEPARTMENTS)[number] =>
  DEPARTMENTS[floor] ?? FIRST_DEPARTMENT;

export const floorOfDesk = (layout: Layout, agentId: string) =>
  layout.objects.find((o) => o.agentId === agentId)?.floor ?? 0;

/** World height of a floor: stacked tightly, or spread apart in the exploded view. */
export const floorY = (floor: number, exploded: boolean) =>
  floor * (FLOOR_HEIGHT + (exploded ? EXPLODED_GAP : 0));
/**
 * A camera offset adjusted for the viewport's width over height. The views are framed for a landscape screen; in
 * portrait the camera stands farther back so the width still fits, and higher, looking down more steeply, so the
 * floor fills the height instead of a strip in the middle.
 */
export function fittedOffset(
  offset: [number, number, number],
  aspect: number,
): [number, number, number] {
  const farther = Math.min(2.4, Math.max(1, 1.25 / aspect));
  if (aspect >= 1) return [offset[0] * farther, offset[1] * farther, offset[2] * farther];
  const steeper = 1 + (1 - aspect) * 0.5;
  return [offset[0] * farther * 0.85, offset[1] * farther * steeper, offset[2] * farther * 0.85];
}
/** Where the camera looks for a floor, or for the whole building when it is spread apart. */
export const lookY = (floor: number, exploded: boolean) =>
  exploded ? floorY((FLOORS - 1) / 2, true) : floorY(floor, false);
// Camera offsets from what it looks at: the whole building or one floor, a desk, a room.
export const OVERVIEW = (exploded: boolean): [number, number, number] =>
  exploded ? [62, 44, 82] : [30, 34, 44];
export const AGENT_OFFSET: [number, number, number] = [3.4, 3.0, 4.6];
/** Following a member: far enough that its name tag, a metre over its head, stays on screen. */
export const FOLLOW_OFFSET: [number, number, number] = [3.2, 2.9, 4.4];
export const ZONE_OFFSET: [number, number, number] = [14, 12, 17];

/** Activities in which a member is doing something: they get a lit screen and a flowing branch beam, and are visited by the tour. */
export const ACTIVE: readonly Agent['activity'][] = [
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
];
