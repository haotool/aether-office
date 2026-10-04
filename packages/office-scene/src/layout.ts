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

const MIN_DESKS = [12, 8, 8, 8, 8]; // a populated look even on a quiet floor; the ground floor keeps its original twelve
/**
 * One layout for the whole building. `floorOf` says which floor an agent works on (default: the ground floor); the
 * ground-floor ids stay `desk-<n>` so layouts saved before floors existed keep meaning the same thing.
 */
export function defaultLayout(
  agents: readonly Agent[],
  floorOf: (agent: Agent) => number = () => 0,
): Layout {
  const objects: Layout['objects'] = [];
  for (let floor = 0; floor < FLOORS; floor++) {
    const here = agents.filter((a) => Math.min(FLOORS - 1, Math.max(0, floorOf(a))) === floor);
    const desks = Math.min(FLOOR_CAPACITY, Math.max(MIN_DESKS[floor] ?? 8, here.length));
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
