import { DomainError } from './errors.js';
export type PlacedObject = {
  id: string;
  type: 'desk' | 'plant' | 'sofa' | 'rack' | 'table' | 'squad';
  x: number;
  z: number;
  rotation: number;
  agentId: string | null;
  floor?: number;
  span?: readonly [number, number];
  anchor?: string;
  seats?: number;
};
const objectSize = {
  desk: [2.2, 1.8],
  plant: [0.9, 0.9],
  sofa: [3.2, 1.2],
  rack: [1.2, 1.0],
  table: [3.0, 2.0],
} as const;
const SQUAD_MIN_SPAN = [3, 2.5] as const;
export const SQUAD_PITCH = 1.6;
export const SQUAD_MARGIN = 0.4;
export const squadCapacity = (span: readonly [number, number]) =>
  Math.floor((span[0] - SQUAD_MARGIN) / SQUAD_PITCH) *
  Math.floor((span[1] - SQUAD_MARGIN) / SQUAD_PITCH);

/**
 * 2 when it holds a squad zone, otherwise 1, so a layout without squads stays readable by an older server or client.
 */
export const layoutVersionOf = (objects: readonly Pick<PlacedObject, 'type'>[]): 1 | 2 =>
  objects.some((o) => o.type === 'squad') ? 2 : 1;

export function objectBounds(o: PlacedObject, padding = 0) {
  const [w, d] = o.type === 'squad' ? (o.span ?? SQUAD_MIN_SPAN) : objectSize[o.type];
  const swap = o.rotation % 2 === 1;
  return {
    minX: o.x - (swap ? d : w) / 2 - padding,
    maxX: o.x + (swap ? d : w) / 2 + padding,
    minZ: o.z - (swap ? w : d) / 2 - padding,
    maxZ: o.z + (swap ? w : d) / 2 + padding,
  };
}
type LayoutBounds = ReturnType<typeof objectBounds>;

function assertUniqueLayoutIds(objects: readonly PlacedObject[]): void {
  if (new Set(objects.map((o) => o.id)).size !== objects.length)
    throw new DomainError('LAYOUT_DUPLICATE_ID', 400);
}

function assertUniqueLayoutAgents(objects: readonly PlacedObject[]): void {
  const assigned = objects.filter((o) => o.agentId).map((o) => o.agentId);
  if (new Set(assigned).size !== assigned.length)
    throw new DomainError('LAYOUT_DUPLICATE_AGENT', 400);
}

function layoutOutOfBounds(a: LayoutBounds): boolean {
  return a.minX < -25 || a.maxX > 25 || a.minZ < -17 || a.maxZ > 17;
}

function layoutBlocksAisle(a: LayoutBounds): boolean {
  return (a.minX < 1 && a.maxX > -1) || (a.minZ < 1 && a.maxZ > -1);
}

function layoutBoxesOverlap(a: LayoutBounds, b: LayoutBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function validateLayoutCollisions(
  objects: readonly PlacedObject[],
  bounds: readonly LayoutBounds[],
): void {
  for (const [i, a] of bounds.entries()) {
    if (layoutOutOfBounds(a)) throw new DomainError('LAYOUT_OUT_OF_BOUNDS', 400);
    if (layoutBlocksAisle(a)) throw new DomainError('LAYOUT_BLOCKS_AISLE', 400);
    for (const [j, b] of bounds.slice(0, i).entries()) {
      if ((objects[i]?.floor ?? 0) !== (objects[j]?.floor ?? 0)) continue;
      if (layoutBoxesOverlap(a, b)) throw new DomainError('LAYOUT_OVERLAP', 400);
    }
  }
}

export function validateLayout(objects: readonly PlacedObject[]): void {
  assertUniqueLayoutIds(objects);
  assertUniqueLayoutAgents(objects);
  validateSquads(objects);
  validateLayoutCollisions(
    objects,
    objects.map((o) => objectBounds(o)),
  );
}

function validateSquads(objects: readonly PlacedObject[]): void {
  const anchors = new Set<string>();
  for (const o of objects) {
    if (o.type !== 'squad') continue;
    const anchor = objects.find((d) => d.id === o.anchor);
    if (!anchor || anchor.type !== 'desk' || (anchor.floor ?? 0) !== (o.floor ?? 0))
      throw new DomainError('LAYOUT_SQUAD_ANCHOR', 400);
    if (anchors.has(anchor.id)) throw new DomainError('LAYOUT_SQUAD_DUPLICATE', 400);
    anchors.add(anchor.id);
    if ((o.seats ?? 0) > squadCapacity(o.span ?? SQUAD_MIN_SPAN))
      throw new DomainError('LAYOUT_SQUAD_CAPACITY', 400);
  }
}
