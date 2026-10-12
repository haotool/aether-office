import { objectBounds, type PlacedObject } from './layout.js';

export type Point = { x: number; z: number };
export type NavGrid = {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  blocked: Uint8Array;
};
type PathResult = { status: 'ok'; points: Point[] } | { status: 'unreachable' };

const FLOOR = { minX: -24.5, maxX: 24.5, minZ: -16.5, maxZ: 16.5 };

export function buildNavGrid(
  objects: readonly PlacedObject[],
  options: { cell?: number; clearance?: number } = {},
): NavGrid {
  const cell = options.cell ?? 0.5;
  const clearance = options.clearance ?? 0.3;
  const cols = Math.ceil((FLOOR.maxX - FLOOR.minX) / cell) + 1;
  const rows = Math.ceil((FLOOR.maxZ - FLOOR.minZ) / cell) + 1;
  const blocked = new Uint8Array(cols * rows);
  for (const object of objects) {
    if (object.type === 'squad') continue;
    const b = objectBounds(object, clearance);
    const c0 = Math.max(0, Math.floor((b.minX - FLOOR.minX) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((b.maxX - FLOOR.minX) / cell));
    const r0 = Math.max(0, Math.floor((b.minZ - FLOOR.minZ) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((b.maxZ - FLOOR.minZ) / cell));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const x = FLOOR.minX + c * cell;
        const z = FLOOR.minZ + r * cell;
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) blocked[r * cols + c] = 1;
      }
  }
  return { cell, cols, rows, minX: FLOOR.minX, minZ: FLOOR.minZ, blocked };
}

const cellOf = (g: NavGrid, p: Point): [number, number] => [
  Math.round((p.x - g.minX) / g.cell),
  Math.round((p.z - g.minZ) / g.cell),
];
const pointOf = (g: NavGrid, c: number, r: number): Point => ({
  x: g.minX + c * g.cell,
  z: g.minZ + r * g.cell,
});
const open = (g: NavGrid, c: number, r: number) =>
  c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.blocked[r * g.cols + c] === 0;

function nearestWalkable(g: NavGrid, p: Point, maxRadius = 3): Point | null {
  const [c0, r0] = cellOf(g, p);
  const span = Math.ceil(maxRadius / g.cell);
  let best: { d: number; c: number; r: number } | null = null;
  for (let r = r0 - span; r <= r0 + span; r++)
    for (let c = c0 - span; c <= c0 + span; c++) {
      if (!open(g, c, r)) continue;
      const q = pointOf(g, c, r);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d <= maxRadius && (!best || d < best.d)) best = { d, c, r };
    }
  return best ? pointOf(g, best.c, best.r) : null;
}

function lineOfSight(g: NavGrid, a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (g.cell / 2));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const [c, r] = cellOf(g, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (!open(g, c, r)) return false;
  }
  return true;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

function cellsTo(g: NavGrid, parent: Map<number, number>, at: number): Point[] {
  const cells: Point[] = [];
  for (let cur: number | undefined = at; cur !== undefined; cur = parent.get(cur))
    cells.push(pointOf(g, cur % g.cols, Math.floor(cur / g.cols)));
  return cells.reverse();
}

type PathNode = { f: number; c: number; r: number };
type PathSearch = {
  g: NavGrid;
  gc: number;
  gr: number;
  index: (c: number, r: number) => number;
  cost: Map<number, number>;
  parent: Map<number, number>;
  push: (n: PathNode) => void;
};

function relaxPathNeighbours(search: PathSearch, c: number, r: number, base: number): void {
  const { g, gc, gr, index, cost, parent, push } = search;
  for (const [dc, dr] of NEIGHBOURS) {
    const nc = c + dc;
    const nr = r + dr;
    if (!open(g, nc, nr)) continue;
    if (dc !== 0 && dr !== 0 && !(open(g, c + dc, r) && open(g, c, r + dr))) continue;
    const next = base + Math.hypot(dc, dr);
    const key = index(nc, nr);
    if (next < (cost.get(key) ?? Infinity)) {
      cost.set(key, next);
      parent.set(key, index(c, r));
      push({ f: next + Math.hypot(gc - nc, gr - nr), c: nc, r: nr });
    }
  }
}

export function findPath(g: NavGrid, from: Point, to: Point): PathResult {
  const start = nearestWalkable(g, from);
  const goal = nearestWalkable(g, to);
  if (!start || !goal) return { status: 'unreachable' };
  const [sc, sr] = cellOf(g, start);
  const [gc, gr] = cellOf(g, goal);
  const index = (c: number, r: number) => r * g.cols + c;
  const cost = new Map<number, number>([[index(sc, sr), 0]]);
  const parent = new Map<number, number>();
  const heap: PathNode[] = [{ f: 0, c: sc, r: sr }];
  const push = (n: PathNode) => {
    heap.push(n);
    heap.sort((a, b) => b.f - a.f);
  };
  const search: PathSearch = { g, gc, gr, index, cost, parent, push };
  const done = new Set<number>();
  for (let node = heap.pop(); node; node = heap.pop()) {
    const { c, r } = node;
    const here = index(c, r);
    if (done.has(here)) continue;
    done.add(here);
    if (c === gc && r === gr) return { status: 'ok', points: smooth(g, cellsTo(g, parent, here)) };
    relaxPathNeighbours(search, c, r, cost.get(here) ?? Infinity);
  }
  return { status: 'unreachable' };
}

function smooth(g: NavGrid, cells: Point[]): Point[] {
  const first = cells[0];
  const last = cells.at(-1);
  if (!first || !last) return cells;
  const out: Point[] = [first];
  let anchor = first;
  for (let i = 2; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cell = cells[i];
    if (prev && cell && !lineOfSight(g, anchor, cell)) {
      out.push(prev);
      anchor = prev;
    }
  }
  out.push(last);
  return out;
}

export const pathLength = (points: readonly Point[]) =>
  points.reduce((n, p, i) => {
    const q = points[i - 1];
    return q ? n + Math.hypot(p.x - q.x, p.z - q.z) : 0;
  }, 0);
