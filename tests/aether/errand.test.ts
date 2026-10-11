import { describe, expect, it } from 'vitest';
import { buildNavGrid } from '../../packages/kernel/src/index.js';
import type { Agent } from '../../packages/contracts/src/index.js';
import { defaultLayout } from '../../packages/office-scene/src/environment/layout.js';
import {
  SEAT_DEPTH,
  STAND_MS,
  WAVE_MS,
  departureAt,
} from '../../packages/office-scene/src/animals/departure.js';
import {
  SIT_MS,
  TURN_MS,
  arrivalAt,
  arrivalMode,
  blockPods,
  leaveDuration,
  planArrival,
  planLeave,
} from '../../packages/office-scene/src/squad/errand.js';
import {
  ARRIVE_MS,
  EMPTY_SQUAD,
  stepSquad,
  type SquadInput,
} from '../../packages/office-scene/src/squad/squad-model.js';
import {
  placeZones,
  podSeats,
  withPodSeats,
} from '../../packages/office-scene/src/squad/squad-seats.js';

const agent = (id: string) => ({ id }) as Agent;
const layout = defaultLayout([agent('local:s1'), agent('local:s2')]);
const grid = buildNavGrid(layout.objects);
const chair = { x: -12, z: -3 };

describe('arrival', () => {
  const plan = planArrival(grid, chair, Math.PI / 2, 'high', false);
  const total = plan.points.reduce(
    (sum, p, i) =>
      i ? sum + Math.hypot(p.x - plan.points[i - 1]!.x, p.z - plan.points[i - 1]!.z) : 0,
    0,
  );

  it('walks from the core to the chair, whole within the arrival budget', () => {
    expect(plan.mode).toBe('walk');
    expect(plan.points[plan.points.length - 1]).toEqual({ x: 0, z: 0 });
    const core = plan.points[0]!;
    const yaw = Math.PI / 2;
    expect(core.x * Math.cos(yaw) + core.z * Math.sin(yaw)).toBeCloseTo(0 - chair.x, 5);
    expect(-core.x * Math.sin(yaw) + core.z * Math.cos(yaw)).toBeCloseTo(0 - chair.z, 5);
    expect((total / plan.speed) * 1000 + TURN_MS + SIT_MS).toBeLessThanOrEqual(ARRIVE_MS + 1);
  });

  it('comes out of the core small, walks, turns to face the desk and is done', () => {
    const start = arrivalAt(plan, 0);
    expect(start).toMatchObject({ clip: 'walk', hidden: false, done: false });
    expect(start.scale).toBeLessThan(0.05);
    const mid = arrivalAt(plan, (total / plan.speed) * 500);
    expect(mid).toMatchObject({ clip: 'walk', scale: 1 });
    const turning = arrivalAt(plan, (total / plan.speed) * 1000 + TURN_MS / 2);
    expect(turning).toMatchObject({ clip: 'idle', done: false });
    expect(Math.hypot(turning.x, turning.z)).toBeCloseTo(0, 5);
    const seated = arrivalAt(plan, (total / plan.speed) * 1000 + TURN_MS + 10);
    expect(seated).toMatchObject({ clip: null, done: true, x: 0, z: 0, yaw: 0 });
  });

  it('is only hidden before it starts', () => {
    expect(arrivalAt(plan, -1)).toMatchObject({ hidden: true, scale: 0 });
  });

  it('appears in the seat when motion is reduced, the tier is low or the pod is far', () => {
    expect(arrivalMode(5, 'high', true)).toBe('appear');
    expect(arrivalMode(5, 'low', false)).toBe('materialize');
    expect(arrivalMode(11, 'balanced', false)).toBe('materialize');
    expect(arrivalMode(11, 'high', false)).toBe('walk');
    const far = planArrival(grid, chair, 0, 'low', false);
    expect(arrivalAt(far, 0)).toMatchObject({ scale: 0, done: false });
    expect(arrivalAt(far, 900)).toMatchObject({ scale: 1, done: true });
    expect(arrivalAt(planArrival(grid, chair, 0, 'high', true), 0).done).toBe(true);
  });
});

describe('leaving', () => {
  const { plan } = planLeave(grid, chair, 0);

  it('is a departure from the pod into the core: stand, wave, walk, sink', () => {
    expect(plan.points[0]).toEqual({ x: 0, z: 0 });
    expect(departureAt(plan, 100).clip).toBe('stand_up');
    expect(departureAt(plan, STAND_MS + 100).clip).toBe('wave');
    expect(departureAt(plan, STAND_MS + WAVE_MS + 100).clip).toBe('walk');
    expect(departureAt(plan, leaveDuration(planLeave(grid, chair, 0)) + 1000).gone).toBe(true);
    expect(leaveDuration(planLeave(grid, chair, 0))).toBeGreaterThan(STAND_MS + WAVE_MS);
  });
});

describe('pods in the way', () => {
  it('blocks the other pods and leaves the walker its own', () => {
    const pods = [chair, { x: -10.4, z: -3 }];
    const blocked = blockPods(grid, pods, chair);
    const at = (g: typeof grid, p: { x: number; z: number }) =>
      g.blocked[Math.round((p.z - g.minZ) / g.cell) * g.cols + Math.round((p.x - g.minX) / g.cell)];
    expect(at(blocked, pods[1]!)).toBe(1);
    expect(at(blocked, chair)).toBe(at(grid, chair));
    expect(grid.blocked).not.toBe(blocked.blocked);
  });
});

describe('seats', () => {
  const input: SquadInput[] = [
    {
      supervisor: 'local:s1',
      members: ['a', 'b', 'c'].map((n) => ({
        id: `local:s1:sub:${n}`,
        type: 'Explore',
        status: 'running' as const,
        startedAt: 0,
        lastSeen: 0,
        toolCount: 0,
      })),
    },
  ];
  const state = stepSquad(EMPTY_SQUAD, { squads: input, leaveMs: () => 1 }, 1000);
  const zones = placeZones(layout, state, ['local:s1']);

  it('puts the zone beside the supervisor desk, with a pod for every member', () => {
    expect(zones).toHaveLength(1);
    expect(zones[0]!.pods.length).toBeGreaterThanOrEqual(3);
    expect(zones[0]!.rect.anchor).toBe(layout.objects.find((o) => o.agentId === 'local:s1')!.id);
  });

  it('makes each pod a seat the scene finds like a desk, facing the supervisor', () => {
    const seats = podSeats(zones, state, 1000);
    expect(seats.map((s) => s.member)).toEqual(['a', 'b', 'c'].map((n) => `local:s1:sub:${n}`));
    const seated = withPodSeats(layout, seats);
    const first = seated.objects.find((o) => o.agentId === seats[0]!.member)!;
    const yaw = (first.rotation * Math.PI) / 2;
    expect(first.x + SEAT_DEPTH * Math.sin(yaw)).toBeCloseTo(seats[0]!.x, 9);
    expect(first.z + SEAT_DEPTH * Math.cos(yaw)).toBeCloseTo(seats[0]!.z, 9);
    const desk = layout.objects.find((o) => o.agentId === 'local:s1')!;
    const toDesk = { x: desk.x - seats[0]!.x, z: desk.z - seats[0]!.z };
    expect(toDesk.x * -Math.sin(yaw) + toDesk.z * -Math.cos(yaw)).toBeGreaterThan(0);
    expect(layout.objects.some((o) => o.agentId === seats[0]!.member)).toBe(false);
  });

  it('has no zone for a supervisor that has no desk', () => {
    expect(placeZones(layout, state, ['local:nobody'])).toEqual([]);
  });
});
