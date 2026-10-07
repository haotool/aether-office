import { buildNavGrid } from '../../packages/kernel/src/index.js';
import type { Agent } from '../../packages/contracts/src/index.js';
import { defaultLayout } from '../../packages/office-scene/src/layout.js';
import {
  register,
  type Book,
  type Live,
  type Request,
} from '../../packages/office-scene/src/squad/handover/book.js';
import {
  deskPlaces,
  handoverSide,
  routeHandover,
  timeline,
  type HandoverMode,
  type HandoverPlan,
} from '../../packages/office-scene/src/squad/handover/plan.js';
import type { DrawSquad } from '../../packages/office-scene/src/squad/squad-draw.js';

// Shared by the hand-over specs: a default office, a supervisor's desk with a squad beside it, and plans and books on it.
const agent = (id: string) => ({ id }) as Agent;
export const layout = defaultLayout([agent('local:s1'), agent('local:s2')]);
export const grid = buildNavGrid(layout.objects);
export const desk = layout.objects.find((o) => o.type === 'desk' && o.agentId === 'local:s1')!;
export const chair = { x: desk.x + 3, z: desk.z + 2 };
export const squad = {
  supervisor: 'local:s1',
  floor: 0,
  x: desk.x + 3,
  z: desk.z + 2,
  deskX: desk.x,
  deskZ: desk.z,
  deskRotation: desk.rotation,
  side: handoverSide(desk, { x: desk.x + 3, z: desk.z + 2 }),
} as DrawSquad;
export const T0 = 5_000_000;
/** A wall-clock time `ms` after T0, whole milliseconds like a real clock (the plan's times are not). */
export const at = (ms: number) => T0 + Math.ceil(ms);

export const makePlan = (
  mode: HandoverMode = 'walk',
  kind: 'received' | 'returned' = 'received',
  wait = 0,
): HandoverPlan => {
  const places = deskPlaces(desk, squad.side);
  const route = routeHandover(grid, chair, 0, places);
  return {
    mode,
    kind,
    seed: 12345,
    origin: chair,
    frameYaw: 0,
    places,
    side: squad.side,
    route,
    t: timeline(mode, wait, route),
  };
};

export const request = (over: Partial<Request> = {}): Request => ({
  id: 'local:s1:sub:a',
  supervisor: 'local:s1',
  floor: 0,
  since: T0,
  walkMs: 5000,
  inView: true,
  quality: 'high',
  still: false,
  relation: true,
  ...over,
});
export const withEntry = (
  book: Book,
  id: string,
  mode: HandoverMode,
  over: Partial<Request> = {},
  wait = 0,
) => {
  const plan = makePlan(mode, 'received', wait);
  return register(book, {
    id,
    supervisor: over.supervisor ?? 'local:s1',
    floor: over.floor ?? 0,
    type: 'Explore',
    since: over.since ?? T0,
    plan,
  });
};
export const alive = (book: Book, extra: string[] = []): Live => ({
  supervisors: new Set(['local:s1', ...extra]),
  members: new Set(Object.values(book.entries).map((e) => e.id)),
});
