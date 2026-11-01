import { describe, expect, it } from 'vitest';
import { SEATING } from '../../packages/office-scene/src/core/seating.js';
import { CONSOLE_KINDS, panelsOf } from '../../packages/office-scene/src/squad/squad-console.js';

const squad = (seated: number, deskRotation = 0) => ({
  deskX: 10,
  deskZ: 20,
  deskRotation,
  pods: Array.from({ length: 8 }, (_, i) => ({
    x: i,
    z: i,
    member: i < seated ? `m${i}` : null,
    silhouette: false,
    since: 0,
  })),
});

describe('supervisor console', () => {
  it('stays dark for a supervisor nobody works under', () => {
    expect(panelsOf(squad(0))).toEqual([]);
  });

  it('puts up more screens as the squad grows, in mirrored pairs', () => {
    expect(panelsOf(squad(1))).toHaveLength(2);
    expect(panelsOf(squad(2))).toHaveLength(2);
    expect(panelsOf(squad(3))).toHaveLength(4);
    expect(panelsOf(squad(5))).toHaveLength(4);
    expect(panelsOf(squad(6))).toHaveLength(5);
    expect(panelsOf(squad(8))).toHaveLength(5);
  });

  it('shows a different kind of screen on every panel', () => {
    const kinds = panelsOf(squad(8)).map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(CONSOLE_KINDS).toEqual(expect.arrayContaining(kinds));
  });

  it('hangs the panels at the desk, in front of its main screen and around it', () => {
    const [left, right] = panelsOf(squad(1));
    expect(left?.x).toBeLessThan(10 - 0.5);
    expect(right?.x).toBeGreaterThan(10 + 0.5);
    expect(left?.y).toBeGreaterThan(SEATING.screenY - 0.2);
    expect(left?.yaw).toBeGreaterThan(0);
    expect(right?.yaw).toBeLessThan(0);
  });

  it('turns with the desk', () => {
    const [first] = panelsOf(squad(1, 0));
    const [turned] = panelsOf(squad(1, 1));
    expect((turned?.x ?? 0) - 10).toBeCloseTo((first?.z ?? 0) - 20);
    expect((turned?.z ?? 0) - 20).toBeCloseTo(-((first?.x ?? 0) - 10));
    expect(turned?.yaw).toBeCloseTo((first?.yaw ?? 0) + Math.PI / 2);
  });
});
