import type { Agent, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';

export const FLOORS = DEPARTMENTS.length;
export const zones = [
  { id: 'atrium', en: 'Command Atrium', zh: '指揮中庭', x: 0, z: 0 },
  { id: 'engineering', en: 'Engineering Pods', zh: '工程工作區', x: -16, z: -3 },
  { id: 'review', en: 'Review Studio', zh: '審查工作室', x: 16, z: -3 },
  { id: 'collaboration', en: 'Collaboration Chamber', zh: '協作會議室', x: 0, z: -12 },
  { id: 'compute', en: 'Compute Gallery', zh: '運算中心', x: -16, z: -12 },
  { id: 'knowledge', en: 'Knowledge Archive', zh: '知識檔案室', x: 16, z: -12 },
  { id: 'arrival', en: 'Arrival Lobby', zh: '迎賓大廳', x: 0, z: 12 },
  { id: 'lounge', en: 'Quiet Lounge', zh: '靜謐休息室', x: -16, z: 11 },
  { id: 'integrations', en: 'Integration Dock', zh: '整合中心', x: 16, z: 11 },
] as const;

// The rooms keep their positions on every floor; what they are, and what they are called, depends on the department.
const NAMES: Record<string, Partial<Record<(typeof zones)[number]['id'], [string, string]>>> = {
  product: {
    engineering: ['Product Pods', '產品工作區'],
    review: ['Design Review', '設計審查室'],
    collaboration: ['Product Sync Room', '產品同步室'],
    compute: ['Build Farm', '建置農場'],
    knowledge: ['Design Library', '設計資料庫'],
  },
  platform: {
    engineering: ['Platform Pods', '平台工作區'],
    review: ['Release Desk', '發佈台'],
    collaboration: ['Incident War Room', '事故指揮室'],
    compute: ['Network Operations Center', '運維中心'],
    knowledge: ['Runbook Archive', '維運手冊庫'],
  },
  quality: {
    engineering: ['QA Pods', '測試工作區'],
    review: ['Security Studio', '資安工作室'],
    collaboration: ['Defect Triage Room', '缺陷分流室'],
    compute: ['Test Lab', '測試實驗室'],
    knowledge: ['Test Archive', '測試紀錄庫'],
  },
  data: {
    engineering: ['Data Pods', '資料工作區'],
    review: ['Model Review', '模型審查室'],
    collaboration: ['Analytics Room', '分析室'],
    compute: ['Data Lake', '資料湖'],
    knowledge: ['Feature Store', '特徵庫'],
  },
  leadership: {
    engineering: ['Staff Pods', '資深工作區'],
    review: ['Architecture Board', '架構委員會'],
    collaboration: ['Strategy Room', '策略室'],
    compute: ['Observatory', '全域觀測台'],
    knowledge: ['Docs & DevRel Studio', '文件與開發者關係'],
  },
};
/** Zones of one floor, named for its department. */
export function floorZones(floor: number) {
  const department = DEPARTMENTS[floor]?.id ?? 'product';
  return zones.map((zone) => {
    const [en, zh] = NAMES[department]?.[zone.id] ?? [zone.en, zone.zh];
    return { ...zone, en, zh };
  });
}

// Desk columns either side of the central aisle, rows clear of the aisle cross and the north rooms.
const COLUMNS = [-22, -18, -14, -10, 10, 14, 18, 22];
const ROWS = [-6, -2.2, 3.6, 7.4, 11.2, 15];
/** Desks one floor can hold: desk positions never leave the floor and never block the circulation aisles. */
export const FLOOR_CAPACITY = COLUMNS.length * ROWS.length;
export const seatAt = (index: number): [number, number] => [
  COLUMNS[index % COLUMNS.length]!,
  ROWS[Math.floor(index / COLUMNS.length) % ROWS.length]!,
];

const clampFloor = (floor: number) => Math.min(FLOORS - 1, Math.max(0, floor));
/** The floors to try for an agent, nearest-first: its own, then each following floor, wrapping round. */
export const floorsFrom = (floor: number) =>
  Array.from({ length: FLOORS }, (_, k) => (clampFloor(floor) + k) % FLOORS);

/** A desk by floor and slot (the index `seatAt` maps to a place). */
export type Seat = readonly [floor: number, slot: number];

/**
 * Who sits where. An agent already in `previous` keeps its seat for as long as it is among `agents`, whatever order they
 * come in; every other agent takes the first free slot on its floor (the next floor with room when that one is full), in
 * the order given. A departed agent's seat is simply free again; nobody else moves. An entry of `previous` that is not a
 * valid, unshared seat is ignored. Pure: returns a new map holding only the agents present.
 */
export function assignSeats(
  previous: ReadonlyMap<string, Seat>,
  agents: readonly Agent[],
  floorOf: (agent: Agent) => number = () => 0,
): Map<string, Seat> {
  const taken = Array.from({ length: FLOORS }, () => new Set<number>());
  const out = new Map<string, Seat>();
  const fresh: Agent[] = [];
  for (const agent of agents) {
    const [floor, slot] = previous.get(agent.id) ?? [-1, -1];
    const ok =
      Number.isInteger(floor) &&
      Number.isInteger(slot) &&
      floor >= 0 &&
      floor < FLOORS &&
      slot >= 0 &&
      slot < FLOOR_CAPACITY &&
      !taken[floor]!.has(slot);
    if (ok) {
      taken[floor]!.add(slot);
      out.set(agent.id, [floor, slot]);
    } else fresh.push(agent);
  }
  for (const agent of fresh)
    for (const floor of floorsFrom(floorOf(agent))) {
      let slot = 0;
      while (taken[floor]!.has(slot)) slot++;
      if (slot >= FLOOR_CAPACITY) continue;
      taken[floor]!.add(slot);
      out.set(agent.id, [floor, slot]);
      break;
    }
  return out;
}

const MIN_DESKS = [12, 8, 8, 8, 8]; // a populated look even on a quiet floor; the ground floor keeps its original twelve
/**
 * One layout for the whole building. `floorOf` says which floor an agent works on (default: the ground floor); the
 * ground-floor ids stay `desk-<n>` so layouts saved before floors existed keep meaning the same thing. `seats` (see
 * `assignSeats`) holds the desks agents already have, so a desk can stay empty between two members.
 */
export function defaultLayout(
  agents: readonly Agent[],
  floorOf: (agent: Agent) => number = () => 0,
  seats: ReadonlyMap<string, Seat> = new Map(),
): Layout {
  const objects: Layout['objects'] = [];
  // A floor holds FLOOR_CAPACITY desks; the members beyond it take the next floor with a free desk. `onFloor[f]` is
  // indexed by slot and has holes where a desk is free.
  const onFloor: Agent[][] = Array.from({ length: FLOORS }, () => []);
  const placed = assignSeats(seats, agents, floorOf);
  for (const agent of agents) {
    const seat = placed.get(agent.id);
    if (seat) onFloor[seat[0]]![seat[1]] = agent;
  }
  for (let floor = 0; floor < FLOORS; floor++) {
    const here = onFloor[floor]!;
    const desks = Math.max(MIN_DESKS[floor] ?? 8, here.length);
    for (let i = 0; i < desks; i++) {
      const [x, z] = seatAt(i);
      objects.push({
        id: floor === 0 ? `desk-${i}` : `desk-f${floor}-${i}`,
        type: 'desk',
        x,
        z,
        rotation: 0,
        agentId: here[i]?.id ?? null,
        floor,
      });
    }
    const tag = floor === 0 ? '' : `f${floor}-`;
    for (const x of floor === 1 || floor === 3 || floor === 0 ? [-22, -18, -14] : [])
      objects.push({
        id: `rack-${tag}${x}`,
        type: 'rack',
        x,
        z: -13,
        rotation: 0,
        agentId: null,
        floor,
      });
    if (floor === 0 || floor === 4)
      for (const x of [-21, -16])
        objects.push({
          id: `sofa-${tag}${x}`,
          type: 'sofa',
          x,
          z: 12,
          rotation: 0,
          agentId: null,
          floor,
        });
    for (const [i, [x, z]] of [
      [-23, 5],
      [-10, 13],
      [10, 13],
      [23, 5],
      [-10, -14],
      [10, -14],
    ].entries())
      objects.push({
        id: `plant-${tag}${i}`,
        type: 'plant',
        x: x!,
        z: z!,
        rotation: 0,
        agentId: null,
        floor,
      });
  }
  return { schemaVersion: 1, objects, zones: zones.map((z) => ({ id: z.id, name: z.zh })) };
}
