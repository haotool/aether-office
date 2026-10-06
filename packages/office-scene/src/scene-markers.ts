import type { Agent, Layout } from '@aether/contracts';
import { displayWidth } from '@aether/kernel';
import { floorZones } from './layout.js';
import type { BranchInfo } from './scene-types.js';
import { ACTIVE, floorY } from './scene-geometry.js';

type Point = [number, number, number];
const seatOf = (layout: Layout, agentId: string) =>
  layout.objects.find((o) => o.agentId === agentId);

/** Where the name tags go: one over each member's desk, and (on a single floor) one over each zone. */
export function labelsOf(
  agents: readonly Agent[],
  layout: Layout,
  floor: number,
  exploded: boolean,
) {
  return [
    ...agents.flatMap((a) => {
      const d = seatOf(layout, a.id);
      return d
        ? [
            {
              id: a.id,
              x: d.x,
              y: floorY(d.floor ?? 0, exploded) + 2,
              z: d.z,
              width: displayWidth(a.name) * 6 + 40, // columns, CJK counting two; the mark, dot and padding come on top
            },
          ]
        : [];
    }),
    ...(exploded ? [] : floorZones(floor).filter((z) => z.id !== 'atrium')).map((z) => ({
      id: z.id,
      x: z.x,
      y: floorY(floor, exploded) + 0.14,
      z: z.z + 3.1,
      width: 110,
    })),
  ];
}

/** The colour of a branch beam: uncommitted work amber, detached violet, a linked worktree cyan, the main checkout white. */
const beamColor = (info: BranchInfo) =>
  info.dirty > 0 ? '#ffc65c' : !info.branch ? '#a592ff' : info.linked ? '#43e6df' : '#e8f2f8';

/** One beam per member that is in a repository, from the desk up into the elevator core. */
export function beamsOf(
  agents: readonly Agent[],
  layout: Layout,
  exploded: boolean,
  branchOf: (agent: Agent) => BranchInfo | null,
) {
  return agents.flatMap((agent) => {
    const info = branchOf(agent);
    const desk = seatOf(layout, agent.id);
    if (!info || !desk) return [];
    const y = floorY(desk.floor ?? 0, exploded);
    return [
      {
        id: agent.id,
        from: [desk.x, y + 1.45, desk.z - 0.3] as Point,
        to: [0, y + 5.4, 0] as Point,
        color: beamColor(info),
        flowing: ACTIVE.includes(agent.activity),
      },
    ];
  });
}

/** The activity marker floating above each member's seat. */
export function beaconsOf(agents: readonly Agent[], layout: Layout, exploded: boolean) {
  return agents.flatMap((agent) => {
    const desk = seatOf(layout, agent.id);
    if (!desk) return [];
    const turn = (desk.rotation * Math.PI) / 2;
    return [
      {
        id: agent.id,
        x: desk.x + Math.sin(turn) * 0.86,
        y: floorY(desk.floor ?? 0, exploded) + 2.25,
        z: desk.z + Math.cos(turn) * 0.86,
        activity: agent.activity,
      },
    ];
  });
}
