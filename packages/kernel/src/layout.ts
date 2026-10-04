import { DomainError } from './index.js';
export type PlacedObject = {
  id: string;
  type: 'desk' | 'plant' | 'sofa' | 'rack' | 'table';
  x: number;
  z: number;
  rotation: number;
  agentId: string | null;
  /** Which floor of the building; absent means the ground floor. */
  floor?: number;
};
export const objectSize = {
  desk: [2.2, 1.8],
  plant: [0.9, 0.9],
  sofa: [3.2, 1.2],
  rack: [1.2, 1.0],
  table: [3.0, 2.0],
} as const;
export function objectBounds(o: PlacedObject, padding = 0) {
  const [w, d] = objectSize[o.type];
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
