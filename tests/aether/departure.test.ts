import { describe, expect, it } from 'vitest';
import { defaultLayout } from '../../packages/office-scene/src/environment/layout.js';
import {
  CORE_RADIUS,
  SEAT_DEPTH,
  SINK_MS,
  STAND_MS,
  WALK_PACE,
  WALK_SPEED,
  WALK_STRIDE_SPEED,
  WAVE_MS,
  departureAt,
  planDepartures,
} from '../../packages/office-scene/src/animals/departure.js';
import type { Agent } from '../../packages/contracts/src/index.js';

const agent = (id: string) => ({ id }) as Agent;
const layout = defaultLayout([agent('a'), agent('b')]);
const plans = planDepartures(layout, ['a', 'b', 'nobody']);
const plan = plans['a']!;
const walkStart = STAND_MS + WAVE_MS;
const walkEnd = walkStart + (plan.walkMetres / WALK_SPEED) * 1000;
const dist = (p: { x: number; z: number }) => Math.hypot(p.x, p.z);

describe('a member sent home', () => {
  it('is planned for seated members only, from the chair to the elevator core, around the desks', () => {
    expect(Object.keys(plans)).toEqual(['a', 'b']);
    const desk = layout.objects.find((o) => o.agentId === 'a')!;
    expect(plan.points[0]).toEqual({ x: desk.x, z: desk.z + SEAT_DEPTH });
    const last = plan.points[plan.points.length - 1]!;
    expect(Math.hypot(last.x, last.z)).toBeLessThan(0.5);
    expect(plan.walkMetres).toBeGreaterThan(5);
  });

  it('stands, waves, walks and is taken up by the core, in that order', () => {
    const at = (ms: number) => departureAt(plan, ms);
    expect(at(-1)).toMatchObject({ clip: null, x: 0, z: 0, yaw: 0, scale: 1, gone: false });
    expect(at(0).clip).toBe('stand_up');
    expect(at(STAND_MS).clip).toBe('wave');
    expect(at(STAND_MS + WAVE_MS / 2 - 1).bag).toBe(false);
    expect(at(walkStart - 1).bag).toBe(true);
    expect(at(walkStart + 500)).toMatchObject({ clip: 'walk', gone: false });
    expect(at(walkEnd + SINK_MS / 2)).toMatchObject({ clip: 'walk', gone: false });
    expect(at(walkEnd + SINK_MS / 2).scale).toBeGreaterThan(0);
    expect(at(walkEnd + SINK_MS / 2).scale).toBeLessThan(1);
    expect(at(walkEnd + SINK_MS + 1)).toMatchObject({ gone: true, scale: 0 });
  });

  it('walks toward the core at a steady pace and never jumps', () => {
    let previous = departureAt(plan, walkStart);
    for (let ms = walkStart + 100; ms < walkEnd; ms += 100) {
      const now = departureAt(plan, ms);
      expect(Math.hypot(now.x - previous.x, now.z - previous.z)).toBeLessThan(
        WALK_SPEED * 0.1 + 1e-6,
      );
      previous = now;
    }
    const arrived = departureAt(plan, walkEnd);
    const seat = plan.points[0]!;
    expect(dist({ x: seat.x + arrived.x, z: seat.z + arrived.z })).toBeLessThan(CORE_RADIUS + 0.2);
  });

  it('plays its walk at the rate that plants each foot: the stride covers the ground the body does', () => {
    expect(WALK_STRIDE_SPEED * WALK_PACE).toBeCloseTo(WALK_SPEED, 5);
    expect(WALK_PACE).toBeGreaterThan(1); // a chibi leg at 1x would skate
    expect(WALK_PACE).toBeLessThan(1.5); // and much faster would look like a scurry
  });

  it('is simply gone at once when motion is reduced, and still seated before its turn comes', () => {
    expect(departureAt(plan, 0, true).gone).toBe(true);
    expect(departureAt(plan, -1, true).gone).toBe(false);
  });
});
