import type { Agent, Layout } from '@aether/contracts';
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
export function defaultLayout(agents: readonly Agent[]): Layout {
  const objects: Layout['objects'] = [];
  const seats = [
    [-21, -6],
    [-17, -6],
    [-13, -6],
    [-21, -2.2],
    [-17, -2.2],
    [-13, -2.2],
    [12, -6],
    [16, -6],
    [20, -6],
    [12, -2.2],
    [16, -2.2],
    [20, -2.2],
  ];
  for (let i = 0; i < Math.max(12, agents.length); i++) {
    const point = seats[i] ?? [-21 + (i % 10) * 4.2, 3.5 + Math.floor((i - 12) / 10) * 3.2];
    objects.push({
      id: `desk-${i}`,
      type: 'desk',
      x: point[0]!,
      z: point[1]!,
      rotation: 0,
      agentId: agents[i]?.id ?? null,
    });
  }
  for (const x of [-22, -18, -14])
    objects.push({ id: `rack-${x}`, type: 'rack', x, z: -13, rotation: 0, agentId: null });
  for (const x of [-21, -16])
    objects.push({ id: `sofa-${x}`, type: 'sofa', x, z: 12, rotation: 0, agentId: null });
  for (const [i, [x, z]] of [
    [-23, 5],
    [-10, 13],
    [10, 13],
    [23, 5],
    [-10, -14],
    [10, -14],
  ].entries())
    objects.push({ id: `plant-${i}`, type: 'plant', x: x!, z: z!, rotation: 0, agentId: null });
  return { schemaVersion: 1, objects, zones: zones.map((z) => ({ id: z.id, name: z.zh })) };
}
