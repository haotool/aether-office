import type { Furniture, Layout, SquadObject } from '@aether/contracts';
import {
  SQUAD_MARGIN,
  SQUAD_PITCH,
  objectBounds,
  squadCapacity,
  validateLayout,
  type PlacedObject,
} from '@aether/kernel';

export { squadCapacity };

export const MAX_SQUAD_SEATS = 12;
const ROW_SEATS = 4;
const DESK_GAP = 0.2;
const ROOM_CAP = 3;
const AUTO_ID = 'squad-auto';
const SIDES = ['east', 'west', 'north', 'south'] as const;

export type SquadRect = {
  anchor: string;
  floor: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  seats: number;
};
export type Pod = { index: number; x: number; z: number };
export type SquadRequest = { deskId: string; count: number };

const isSquad = (o: Furniture): o is SquadObject => o.type === 'squad';
const floorOf = (o: { floor?: number }) => o.floor ?? 0;
const halfUp = (n: number) => Math.ceil(n * 2) / 2;

export function savedSquadOf(layout: Layout, deskId: string): SquadRect | null {
  const zone = layout.objects.filter(isSquad).find((o) => o.anchor === deskId);
  if (!zone) return null;
  const swap = zone.rotation % 2 === 1;
  const [w, d] = zone.span;
  return {
    anchor: deskId,
    floor: floorOf(zone),
    x: zone.x,
    z: zone.z,
    width: swap ? d : w,
    depth: swap ? w : d,
    seats: Math.max(zone.seats, squadCapacity(zone.span)),
  };
}

export const squadObjectOf = (rect: SquadRect, id: string, seats = 0): SquadObject => ({
  id,
  type: 'squad',
  x: rect.x,
  z: rect.z,
  rotation: 0,
  floor: rect.floor,
  agentId: null,
  anchor: rect.anchor,
  span: [rect.width, rect.depth],
  seats,
});

export function podsOf(rect: Pick<SquadRect, 'x' | 'z' | 'width' | 'depth'>): Pod[] {
  const cols = Math.max(0, Math.floor((rect.width - SQUAD_MARGIN) / SQUAD_PITCH));
  const rows = Math.max(0, Math.floor((rect.depth - SQUAD_MARGIN) / SQUAD_PITCH));
  const pods: Pod[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      pods.push({
        index: r * cols + c,
        x: rect.x + (c - (cols - 1) / 2) * SQUAD_PITCH,
        z: rect.z + (r - (rows - 1) / 2) * SQUAD_PITCH,
      });
  return pods;
}

function sizeFor(count: number): { seats: number; span: [number, number] } {
  const wanted = Math.min(MAX_SQUAD_SEATS, Math.max(2, Math.floor(count)));
  const cols = Math.min(ROW_SEATS, wanted);
  const rows = Math.ceil(wanted / cols);
  return {
    seats: cols * rows,
    span: [
      Math.max(3, halfUp(cols * SQUAD_PITCH + SQUAD_MARGIN)),
      Math.max(2.5, halfUp(rows * SQUAD_PITCH + SQUAD_MARGIN)),
    ],
  };
}

type Box = ReturnType<typeof objectBounds>;
const gap = (a: Box, b: Box) =>
  Math.hypot(
    Math.max(a.minX - b.maxX, b.minX - a.maxX, 0),
    Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0),
  );
const overlaps = (a: Box, b: Box) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

function room(box: Box, others: readonly Box[]): number {
  const toAisleX = box.maxX <= 0 ? -1 - box.maxX : box.minX - 1;
  const toAisleZ = box.maxZ <= 0 ? -1 - box.maxZ : box.minZ - 1;
  const near = others.map((o) => gap(box, o));
  return Math.min(
    ROOM_CAP,
    box.minX + 25,
    25 - box.maxX,
    box.minZ + 17,
    17 - box.maxZ,
    toAisleX,
    toAisleZ,
    ...near,
  );
}

type Side = 'east' | 'west' | 'north' | 'south';
type Candidate = { rect: SquadRect; box: Box; side: Side };

function candidateShapes(size: ReturnType<typeof sizeFor>): [number, number][] {
  const shapes: [number, number][] = [size.span];
  const [w, h] = size.span;
  if (w !== h && h >= 3 && w <= 8) shapes.push([h, w]);
  return shapes;
}

function candidateAt(
  desk: PlacedObject,
  d: Box,
  base: Omit<SquadRect, 'x' | 'z' | 'width' | 'depth'>,
  width: number,
  depth: number,
  side: Side,
  align: -1 | 0 | 1,
): Candidate {
  const alongZ = side === 'east' || side === 'west';
  const edge = alongZ ? (depth - (d.maxZ - d.minZ)) / 2 : (width - (d.maxX - d.minX)) / 2;
  const shift = -align * edge;
  const x = alongZ
    ? side === 'east'
      ? d.maxX + DESK_GAP + width / 2
      : d.minX - DESK_GAP - width / 2
    : desk.x + shift;
  const z = alongZ
    ? desk.z + shift
    : side === 'south'
      ? d.maxZ + DESK_GAP + depth / 2
      : d.minZ - DESK_GAP - depth / 2;
  const rect: SquadRect = { ...base, x, z, width, depth };
  const box = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  };
  return { rect, box, side };
}

function candidates(desk: PlacedObject, size: ReturnType<typeof sizeFor>): Candidate[] {
  const d = objectBounds(desk);
  const base = { anchor: desk.id, floor: floorOf(desk), seats: size.seats };
  const out: Candidate[] = [];
  for (const [width, depth] of candidateShapes(size))
    for (const side of SIDES)
      for (const align of [0, -1, 1] as const)
        out.push(candidateAt(desk, d, base, width, depth, side, align));
  return out;
}

export function squadLayout(layout: Layout, deskId: string, count: number): SquadRect | null {
  const saved = savedSquadOf(layout, deskId);
  if (saved) return saved;
  const desk = layout.objects.find((o) => o.id === deskId);
  if (!desk || desk.type !== 'desk') return null;
  const onFloor = layout.objects.filter((o) => floorOf(o) === floorOf(desk) && o.id !== deskId);
  const boxes = onFloor.map((o) => objectBounds(o));
  const size = sizeFor(count);
  const fitting = candidates(desk, size).filter(({ rect, box }) => {
    if (boxes.some((other) => overlaps(box, other))) return false;
    try {
      validateLayout([desk, { ...squadObjectOf(rect, AUTO_ID) }]);
      return true;
    } catch {
      return false;
    }
  });
  const aisleSide: Side = desk.x > 0 ? 'west' : 'east';
  const ranked = fitting.map(
    (c, i): { c: (typeof fitting)[number]; key: [number, number, number] } => ({
      c,
      key: [c.side === aisleSide ? 0 : 1, -room(c.box, boxes), i],
    }),
  );
  ranked.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  return ranked[0]?.c.rect ?? null;
}

/**
 * Each zone is placed with the earlier ones already on the floor, so two auto squads never overlap; every request has
 * an entry (null where nothing fits).
 */
export function placeSquads(
  layout: Layout,
  requests: readonly SquadRequest[],
): Map<string, SquadRect | null> {
  const out = new Map<string, SquadRect | null>();
  let objects = layout.objects;
  for (const { deskId, count } of requests) {
    const rect = squadLayout({ ...layout, objects }, deskId, count);
    out.set(deskId, rect);
    if (rect && !savedSquadOf({ ...layout, objects }, deskId))
      objects = [...objects, squadObjectOf(rect, `${AUTO_ID}-${deskId}`)];
  }
  return out;
}
