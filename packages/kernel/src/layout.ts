import { DomainError } from './errors.js';
export type PlacedObject = {
  id: string;
  type: 'desk' | 'plant' | 'sofa' | 'rack' | 'table' | 'squad';
  x: number;
  z: number;
  rotation: number;
  agentId: string | null;
  /** Which floor of the building; absent means the ground floor. */
  floor?: number;
  /** A squad zone only: its footprint (width, depth) before rotation. */
  span?: readonly [number, number];
  /** A squad zone only: the id of the supervisor's desk, on the same floor. */
  anchor?: string;
  /** A squad zone only: seats reserved at least; 0 lets the zone grow and shrink with its squad. */
  seats?: number;
};
export const objectSize = {
  desk: [2.2, 1.8],
  plant: [0.9, 0.9],
  sofa: [3.2, 1.2],
  rack: [1.2, 1.0],
  table: [3.0, 2.0],
} as const;
/** The smallest squad zone the schema allows: what a squad object without a span is measured as. */
const SQUAD_MIN_SPAN = [3, 2.5] as const;
/** The room one seat takes in a squad zone, and the margin left around the pods. */
export const SQUAD_PITCH = 1.6;
export const SQUAD_MARGIN = 0.4;
/** How many seats a zone of this footprint holds: whole pitches in each direction, inside the margin. */
export const squadCapacity = (span: readonly [number, number]) =>
  Math.floor((span[0] - SQUAD_MARGIN) / SQUAD_PITCH) *
  Math.floor((span[1] - SQUAD_MARGIN) / SQUAD_PITCH);

/**
 * The layout file's version: 2 when it holds a squad zone, otherwise 1, so a layout without squads stays readable by an
 * older server or client. Every saved layout keeps its objects; only this number follows what they are.
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
export function validateLayout(objects: readonly PlacedObject[]): void {
  if (new Set(objects.map((o) => o.id)).size !== objects.length)
    throw new DomainError('LAYOUT_DUPLICATE_ID', 400);
  const assigned = objects.filter((o) => o.agentId).map((o) => o.agentId);
  if (new Set(assigned).size !== assigned.length)
    throw new DomainError('LAYOUT_DUPLICATE_AGENT', 400);
  validateSquads(objects);
  const bounds = objects.map((o) => objectBounds(o));
  for (let i = 0; i < bounds.length; i++) {
    const a = bounds[i]!;
    if (a.minX < -25 || a.maxX > 25 || a.minZ < -17 || a.maxZ > 17)
      throw new DomainError('LAYOUT_OUT_OF_BOUNDS', 400);
    // Two permanent two-metre circulation spines cross the campus.
    if ((a.minX < 1 && a.maxX > -1) || (a.minZ < 1 && a.maxZ > -1))
      throw new DomainError('LAYOUT_BLOCKS_AISLE', 400);
    for (let j = 0; j < i; j++) {
      if ((objects[i]!.floor ?? 0) !== (objects[j]!.floor ?? 0)) continue; // floors do not collide
      const b = bounds[j]!;
      if (a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ)
        throw new DomainError('LAYOUT_OVERLAP', 400);
    }
  }
}

// A squad zone belongs to a desk of its floor, at most one zone per desk, and cannot promise more seats than fit.
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
