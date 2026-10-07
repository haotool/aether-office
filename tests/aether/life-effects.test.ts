import { describe, expect, it } from 'vitest';
import type { Seat } from '../../packages/office-scene/src/director.js';
import { CELLS } from '../../packages/office-scene/src/life/effects/types.js';
import { EFFECTS, EFFECT_IDS } from '../../packages/office-scene/src/life/effects/index.js';
import {
  cueSprites,
  EACH_DESK_MAX,
  type Stage,
} from '../../packages/office-scene/src/life/place.js';
import { POOL_CAPACITY } from '../../packages/office-scene/src/life/pools/sprite-pool.js';
import { previewCues } from '../../packages/office-scene/src/life/schedule.js';
import { LIFE_RULES, ruleOf } from '../../packages/office-scene/src/life/registry.js';
import { env, loud, office } from './life-fixtures.js';

const duration = (id: (typeof EFFECT_IDS)[number]) => ruleOf(id)!.durationMs;
const SEEDS = [1, 7, 12345, 4294967295];

describe('effect timelines', () => {
  it.each(EFFECT_IDS)(
    '%s is deterministic and draws only known pictures within sane bounds',
    (id) => {
      const d = duration(id);
      for (const seed of SEEDS)
        for (const t of [0, d * 0.1, d * 0.4, d * 0.9, d]) {
          const a = EFFECTS[id](t, d, seed, 40);
          expect(EFFECTS[id](t, d, seed, 40)).toEqual(a);
          expect(a.length).toBeGreaterThan(0);
          expect(a.length).toBeLessThanOrEqual(12);
          for (const s of a) {
            expect(CELLS).toContain(s.cell);
            expect(s.size).toBeGreaterThan(0);
            expect(s.size).toBeLessThanOrEqual(3.4);
            expect(s.alpha ?? 1).toBeGreaterThanOrEqual(0);
            expect(s.alpha ?? 1).toBeLessThanOrEqual(1);
            for (const c of s.at) expect(Number.isFinite(c)).toBe(true);
            expect(s.at[1]).toBeGreaterThanOrEqual(0);
            expect(s.at[1]).toBeLessThanOrEqual(5);
          }
        }
    },
  );

  it.each(EFFECT_IDS)('%s fades in from nothing and out to nothing', (id) => {
    const d = duration(id);
    const alphas = (t: number) => EFFECTS[id](t, d, 3, 40).map((s) => s.alpha ?? 1);
    expect(Math.max(...alphas(0))).toBeLessThanOrEqual(0.05);
    expect(Math.max(...alphas(d))).toBeLessThanOrEqual(0.05);
    expect(Math.max(...alphas(d * 0.4))).toBeGreaterThan(0.3);
  });

  it('varies with the seed where it should: the duck sits at different spots on the right, the rocket may be a plane', () => {
    const spots = SEEDS.concat(2, 3, 4, 5).map(
      (s) => EFFECTS['rubber-duck'](5000, 18_000, s, 0)[0]!.at,
    );
    expect(new Set(spots.map((p) => p[0])).size).toBeGreaterThan(3);
    expect(spots.every((p) => p[0] > 0.3)).toBe(true);
    const cells = new Set(
      Array.from({ length: 40 }, (_, s) => EFFECTS['ship-it'](1000, 2600, s, 0)[0]!.cell),
    );
    expect(cells).toEqual(new Set(['rocket', 'plane']));
  });

  it('stacks more boxes for a bigger debt, at most six', () => {
    const boxes = (n: number) => EFFECTS['tech-debt'](20_000, 45_000, 1, n).length;
    expect(boxes(20)).toBeLessThan(boxes(60));
    expect(boxes(1_000_000)).toBe(6);
    expect(boxes(0)).toBe(1);
  });

  it('stays within the pool for the heaviest cue: every desk of a crowded building', () => {
    expect(EACH_DESK_MAX * EFFECTS['konami'](2000, 4500, 1, 0).length).toBeLessThanOrEqual(
      POOL_CAPACITY,
    );
  });
});

describe('putting a cue on the stage', () => {
  const seat = (x: number, z: number, floor: number, rotation = 0): Seat => ({
    x,
    z,
    floor,
    rotation,
  });
  const seats = new Map([
    ['m1', seat(2, 3, 0)],
    ['m2', seat(-4, 3, 0, 1)],
    ['m5', seat(2, 3, 1)],
  ]);
  const stage = (over: Partial<Stage> = {}): Stage => ({
    seats,
    floor: 0,
    exploded: false,
    floorY: (f, e) => f * (e ? 18 : 7),
    reducedMotion: false,
    ...over,
  });
  const cue = (id: string, member: string | null, over = {}) => ({
    ...previewCues(
      [id],
      1500,
      [member ?? 'm1'],
      loud,
      office({ floorOf: () => 0, idleOn: () => ['m1', 'm2'] }),
      env,
    )[0]!,
    member,
    startedAt: 1000,
    frozenT: undefined,
    ...over,
  });

  it("puts a desk effect on its member's desk, turned with the desk, only while that floor is in view", () => {
    const c = cue('rubber-duck', 'm1');
    const near = cueSprites(c, 2500, stage());
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((s) => Math.abs(s.x - 2) < 1.2 && Math.abs(s.z - 3) < 1.2)).toBe(true);
    expect(cueSprites(cue('rubber-duck', 'm5'), 2500, stage())).toEqual([]); // floor 1 is not in view
    expect(
      cueSprites(cue('rubber-duck', 'm5'), 2500, stage({ exploded: true })).length,
    ).toBeGreaterThan(0);
    expect(cueSprites(cue('rubber-duck', 'ghost'), 2500, stage())).toEqual([]);
  });

  it('draws nothing before an effect starts or after it ends, and one still picture with reduced motion', () => {
    const c = cue('rubber-duck', 'm1');
    expect(cueSprites(c, 500, stage())).toEqual([]);
    expect(cueSprites(c, 1000 + c.durationMs + 1, stage())).toEqual([]);
    const still = (now: number) => cueSprites(c, now, stage({ reducedMotion: true }));
    expect(still(1100)).toEqual(still(9000));
    expect(still(1100).length).toBeGreaterThan(0);
  });

  it('puts a group effect on the centre of the group and a building effect on every desk in view', () => {
    const ring = cueSprites(cue('standup', 'm1', { group: ['m1', 'm2'] }), 3000, stage());
    const flat = ring.find((s) => s.cell === 'ring')!;
    expect(flat.flat).toBe(true);
    expect(flat.x).toBeCloseTo(-1);
    expect(flat.z).toBeCloseTo(3);
    const confetti = cueSprites(cue('konami', null), 3000, stage());
    expect(confetti.length).toBe(2 * EFFECTS['konami'](2000, 4500, 1, 0).length); // m1 and m2, not m5
  });

  it('never claims every rule needs a drawing: each shipped rule has one', () => {
    expect(LIFE_RULES.map((r) => r.id).sort()).toEqual([...EFFECT_IDS].sort());
  });
});
