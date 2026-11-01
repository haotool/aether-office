import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAND_MS, WAVE_MS } from '../../packages/office-scene/src/animals/departure.js';
import {
  DESK_MS,
  FOLDER_THICKNESS,
  GLIDE_MS,
  HELD_AHEAD_M,
  LIFT_MS,
  POP_MS,
  PRESS_MS,
  PRESS_TOTAL_MS,
  READ_MS,
  REACH_MS,
  RELEASE_MS,
  WALK_CAP_MS,
  deskPlaces,
  folderAt,
  handoverSide,
  handsAt,
  memberAt,
  pressAt,
  routeHandover,
  stackSkew,
  timeline,
} from '../../packages/office-scene/src/squad/handover/plan.js';
import {
  STAMP_INK,
  STAMP_WORDS,
  stampOf,
  stampWord,
} from '../../packages/office-scene/src/squad/handover/stamp.js';
import { handoverLine } from '../../packages/office-scene/src/squad/handover/text.js';
import { desk, grid, makePlan } from './handover-fixtures.js';

describe('the stamp never claims more than the real flag', () => {
  it('is a receipt unless the parent flagged the result as an error', () => {
    expect(stampOf(null)).toBe('received');
    expect(stampOf(undefined)).toBe('received');
    expect(stampOf({})).toBe('received');
    expect(stampOf({ error: null })).toBe('received');
    expect(stampOf({ error: false })).toBe('received');
    expect(stampOf({ error: true })).toBe('returned');
    expect(stampOf({ ok: false })).toBe('returned');
    expect(stampOf({ ok: true })).toBe('received');
    expect(stampOf({ error: false, ok: false })).toBe('returned');
  });

  it('says RECEIVED or RETURNED, in both locales, and nothing else', () => {
    expect(stampWord(false, 'received')).toBe('RECEIVED');
    expect(stampWord(false, 'returned')).toBe('RETURNED');
    expect(stampWord(true, 'received')).toBe('已收到');
    expect(stampWord(true, 'returned')).toBe('已退回');
    const all = JSON.stringify(STAMP_WORDS).toLowerCase();
    for (const claim of [
      'approv',
      'pass',
      'success',
      'fail',
      'ok',
      'lgtm',
      'verified',
      '核准',
      '通過',
      '成功',
      '失敗',
    ])
      expect(all).not.toContain(claim);
  });

  it('is never inked red or green: a calm slate for a receipt, grey for a return', () => {
    for (const ink of Object.values(STAMP_INK)) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
      expect(r > g + 40 && r > b + 40).toBe(false);
      expect(g > r + 40 && g > b + 40).toBe(false);
    }
    const grey = STAMP_INK.returned
      .slice(1)
      .match(/../g)!
      .map((h) => parseInt(h, 16));
    expect(Math.max(...grey) - Math.min(...grey)).toBeLessThan(20);
  });

  it('keeps the word "approved" out of the scene sources and the aria lines', () => {
    const dir = join(__dirname, '../../packages/office-scene/src/squad');
    const files = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)],
      );
    const sources = files(dir)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => readFileSync(f, 'utf8'));
    // The only mentions are the comments that say it never appears.
    const stray = sources.flatMap((s) =>
      s.split('\n').filter((l) => /approved/i.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)),
    );
    expect(stray).toEqual([]);
    for (const kind of ['received', 'returned'] as const)
      for (const zh of [false, true])
        expect(handoverLine(zh, 'Explore', kind)).not.toMatch(/approv|pass|success|通過|核准/i);
  });

  it('speaks the line of the brief: "<type> handed over its result"', () => {
    expect(handoverLine(false, 'Explore', 'received')).toBe('Explore handed over its result');
    expect(handoverLine(true, 'Explore', 'received')).toBe('Explore 交回了結果');
    expect(handoverLine(false, 'Explore', 'returned')).toContain('marked as an error');
  });
});

describe('the timeline', () => {
  const plan = makePlan();
  const t = plan.t;

  it('goes lift, stand, walk, present, stamp and leave in order, the stamp within 14 s', () => {
    expect(t.liftAt).toBe(DESK_MS);
    expect(t.liftEnd).toBe(t.liftAt + LIFT_MS);
    expect(t.standEnd).toBe(t.liftEnd + STAND_MS);
    expect(t.walkEnd).toBeGreaterThan(t.standEnd);
    expect(t.turnEnd).toBeGreaterThan(t.walkEnd);
    expect(t.placeAt).toBe(t.turnEnd + GLIDE_MS);
    expect(t.stampAt).toBe(t.placeAt + READ_MS);
    expect(t.stampAt).toBeLessThanOrEqual(14_000);
    expect(t.total).toBeGreaterThan(t.stampAt + WAVE_MS);
    expect(plan.route.walkMs).toBeLessThanOrEqual(WALK_CAP_MS + 1);
  });

  it('walks a long way faster so it never takes more than eight seconds', () => {
    const far = routeHandover(grid, { x: 40, z: 40 }, 0, deskPlaces(desk, 1));
    expect(far.walkMs).toBeLessThanOrEqual(WALK_CAP_MS + 1);
    expect(far.speed).toBeGreaterThan(1.2);
  });

  it('keeps the carrier seated while the folder is lifted, then stands, walks, faces the tray, pauses upright and goes', () => {
    const queued = timeline('walk', 2000, plan.route);
    expect(memberAt({ ...plan, t: queued }, 1000)).toMatchObject({ clip: null, x: 0, z: 0 });
    expect(memberAt(plan, t.liftEnd - 10)).toMatchObject({ clip: null, x: 0, z: 0 });
    expect(memberAt(plan, t.liftEnd + 10)).toMatchObject({ clip: 'stand_up' });
    const walking = memberAt(plan, (t.standEnd + t.walkEnd) / 2);
    expect(walking.clip).toBe('walk');
    expect(Math.hypot(walking.x, walking.z)).toBeGreaterThan(0.3);
    const present = memberAt(plan, t.turnEnd + 100);
    expect(present.clip).toBe('idle');
    const spot = plan.route.toSpot[plan.route.toSpot.length - 1]!;
    expect(present.x).toBeCloseTo(spot.x, 5);
    expect(present.z).toBeCloseTo(spot.z, 5);
    expect(memberAt(plan, t.placeAt + 100).clip).toBe('idle');
    expect(memberAt(plan, t.stampAt + 100).clip).toBe('idle');
    expect(memberAt(plan, t.stampAt + WAVE_MS + 500).clip).toBe('walk');
    expect(memberAt(plan, t.total + 1).gone).toBe(true);
    expect(memberAt(plan, t.total - 1).gone).toBe(false);
  });

  it('lays the folder on the desk, holds it in the hands, lowers it into the tray, then leaves it to the stack', () => {
    expect(folderAt(plan, 0, 0).state).toBe('desk');
    expect(folderAt(plan, t.liftAt + REACH_MS - 10, 0).state).toBe('desk');
    expect(folderAt(plan, t.liftAt + REACH_MS, 0).state).toBe('held');
    expect(folderAt(plan, t.walkEnd - 10, 0).state).toBe('held');
    const lowering = folderAt(plan, t.turnEnd + GLIDE_MS / 2, 0);
    expect(lowering.state).toBe('held');
    expect(lowering.y).toBeGreaterThan(plan.places.tray[1]);
    expect(lowering.y).toBeLessThan(folderAt(plan, t.turnEnd, 0).y);
    expect(folderAt(plan, t.placeAt, 0).state).toBe('hidden');
    const landing = folderAt(plan, t.placeAt - 1, 2);
    expect(landing.x).toBeCloseTo(plan.places.tray[0], 1);
    expect(landing.y).toBeCloseTo(plan.places.tray[1] + 2 * FOLDER_THICKNESS, 2);
    expect(landing.z).toBeCloseTo(plan.places.tray[2], 1);
  });

  it('turns the folder to lie along the tray before it lands, so it does not spin on the stack', () => {
    const squareness = (slot: number) => {
      const landing = folderAt(plan, t.placeAt - 1, slot);
      return Math.cos(landing.yaw - plan.places.yaw - stackSkew(slot));
    };
    expect(squareness(0)).toBeCloseTo(1, 3);
    expect(squareness(3)).toBeCloseTo(1, 3);
  });

  it('skews each slot of the stack by a small fixed angle, so a landing never reshuffles the pile', () => {
    const skews = [0, 1, 2, 3, 4].map(stackSkew);
    expect(new Set(skews).size).toBeGreaterThan(1);
    for (const skew of skews) expect(Math.abs(skew)).toBeLessThanOrEqual(0.14);
  });

  it('presses the stamp once, down, hold and up, in a quarter of a second', () => {
    expect(PRESS_TOTAL_MS).toBe(250);
    expect(pressAt(plan, t.stampAt - 1)).toBe(0);
    expect(pressAt(plan, t.stampAt + PRESS_MS.down / 2)).toBeGreaterThan(0);
    expect(pressAt(plan, t.stampAt + PRESS_MS.down + 10)).toBe(1);
    expect(pressAt(plan, t.stampAt + PRESS_TOTAL_MS - 1)).toBeLessThan(0.1);
    expect(pressAt(plan, t.stampAt + PRESS_TOTAL_MS)).toBe(0);
  });

  it('puts the tray and the stamp at the end of the desk nearest the zone', () => {
    const east = deskPlaces({ x: 0, z: 0, rotation: 0 }, 1);
    const west = deskPlaces({ x: 0, z: 0, rotation: 0 }, -1);
    expect(east.tray[0]).toBeGreaterThan(0);
    expect(west.tray[0]).toBeLessThan(0);
    expect(east.spot.x).toBeGreaterThan(east.tray[0]);
    expect(handoverSide({ x: 0, z: 0, rotation: 0 }, { x: 5, z: 0 })).toBe(1);
    expect(handoverSide({ x: 0, z: 0, rotation: 0 }, { x: -5, z: 0 })).toBe(-1);
    expect(handoverSide({ x: 0, z: 0, rotation: 2 }, { x: 5, z: 0 })).toBe(-1);
  });

  it('shows the same receipt with less motion: a pop on the low tier, appearing when still', () => {
    const route = plan.route;
    const pop = timeline('pop', 0, route);
    expect(pop.placeAt).toBe(POP_MS);
    expect(pop.stampAt).toBe(POP_MS + READ_MS);
    const popPlan = { ...plan, mode: 'pop' as const, t: pop };
    expect(folderAt(popPlan, POP_MS / 2, 0).state).toBe('pop');
    expect(folderAt(popPlan, POP_MS, 0).state).toBe('hidden');
    const still = timeline('tray', 0, route);
    expect(still).toMatchObject({ placeAt: 0, stampAt: 0 });
    const trayPlan = { ...plan, mode: 'tray' as const, t: still };
    expect(folderAt(trayPlan, 0, 0).state).toBe('hidden');
    expect(pressAt(trayPlan, 0)).toBe(0);
  });
});

describe('the hands', () => {
  const plan = makePlan();
  const t = plan.t;
  const grip = (ms: number, slot = 0) => handsAt(plan, ms, slot).grip;

  it('rest until the desk is reached, close on the folder, hold it through the walk, let go at the tray and open again', () => {
    expect(grip(0)).toBe(0);
    expect(grip(t.liftAt - 1)).toBe(0);
    expect(grip(t.liftAt + REACH_MS / 2)).toBeGreaterThan(0);
    expect(grip(t.liftAt + REACH_MS / 2)).toBeLessThan(1);
    expect(grip(t.liftAt + REACH_MS)).toBe(1);
    expect(grip((t.standEnd + t.walkEnd) / 2)).toBe(1);
    expect(grip(t.placeAt - 1)).toBe(1);
    expect(grip(t.placeAt + RELEASE_MS / 2)).toBeLessThan(1);
    expect(grip(t.placeAt + RELEASE_MS)).toBe(0);
    expect(grip(t.total)).toBe(0);
  });

  it('lean the body to the desk and back, and to the tray and back, never leaning while the folder is carried', () => {
    const lean = (ms: number) => handsAt(plan, ms, 0).lean;
    expect(lean(0)).toBe(0);
    expect(lean(t.liftAt + REACH_MS)).toBeGreaterThan(0.2);
    expect(lean(t.liftEnd)).toBe(0);
    expect(lean((t.standEnd + t.walkEnd) / 2)).toBe(0);
    expect(lean(t.placeAt)).toBeGreaterThan(0.1);
    expect(lean(t.placeAt + RELEASE_MS)).toBe(0);
  });

  it('keep the folder between them: on the desk, up to the chest, down on the stack', () => {
    const rest = handsAt(plan, 0, 0).left;
    const raised = handsAt(plan, t.liftEnd, 0).left;
    const placed = handsAt(plan, t.placeAt, 3).left;
    expect(rest[1]).toBeLessThan(raised[1]);
    expect(placed[1]).toBeLessThan(raised[1]);
    expect(placed[1]).toBeCloseTo(plan.places.tray[1] + 3 * FOLDER_THICKNESS, 6);
    expect(raised[2]).toBeCloseTo(HELD_AHEAD_M, 6);
    expect(placed[2]).toBeCloseTo(HELD_AHEAD_M, 6);
    expect(handsAt(plan, 0, 0).right[0]).toBeCloseTo(-rest[0], 6);
  });

  it('stay on the folder from the moment it appears to the moment it lands', () => {
    for (let ms = 0; ms < t.placeAt; ms += 97) {
      const folder = folderAt(plan, ms, 1);
      const body = memberAt(plan, ms);
      const { left, right } = handsAt(plan, ms, 1);
      const facing = body.yaw + Math.PI;
      expect(left[1]).toBeCloseTo(right[1], 9);
      expect(left[2]).toBeCloseTo(right[2], 9);
      expect(folder.y).toBeCloseTo(left[1], 6);
      expect(folder.x).toBeCloseTo(plan.origin.x + body.x + Math.sin(facing) * left[2], 6);
      expect(folder.z).toBeCloseTo(plan.origin.z + body.z + Math.cos(facing) * left[2], 6);
    }
  });

  it('reach the tray from the spot where the carrier stands, one arm length of carrying away', () => {
    const { spot, tray } = plan.places;
    expect(Math.hypot(spot.x - tray[0], spot.z - tray[2])).toBeCloseTo(HELD_AHEAD_M, 6);
  });
});
