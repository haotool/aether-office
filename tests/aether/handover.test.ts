import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAND_MS, WAVE_MS } from '../../packages/office-scene/src/animals/departure.js';
import {
  GLIDE_MS,
  POP_MS,
  PRESS_MS,
  PRESS_TOTAL_MS,
  READ_MS,
  FOLDER_THICKNESS,
  WALK_CAP_MS,
  deskPlaces,
  folderAt,
  handoverSide,
  memberAt,
  pressAt,
  routeHandover,
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

  it('goes stand, walk, present, stamp and leave in order, the stamp within 14 s', () => {
    expect(t.standEnd).toBe(STAND_MS);
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

  it('seats the carrier with the folder until it is time, then stands, walks, faces the tray, pauses upright and goes', () => {
    const queued = timeline('walk', 2000, plan.route);
    const waiting = memberAt({ ...plan, t: queued }, 1000);
    expect(waiting).toMatchObject({ clip: null, x: 0, z: 0, carrying: true });
    expect(memberAt(plan, 10)).toMatchObject({ clip: 'stand_up', carrying: true });
    const walking = memberAt(plan, (t.standEnd + t.walkEnd) / 2);
    expect(walking).toMatchObject({ clip: 'walk', carrying: true });
    expect(Math.hypot(walking.x, walking.z)).toBeGreaterThan(0.3);
    const present = memberAt(plan, t.turnEnd + 100);
    expect(present).toMatchObject({ clip: 'idle', carrying: true });
    const spot = plan.route.toSpot[plan.route.toSpot.length - 1]!;
    expect(present.x).toBeCloseTo(spot.x, 5);
    expect(present.z).toBeCloseTo(spot.z, 5);
    expect(memberAt(plan, t.placeAt + 100)).toMatchObject({ clip: 'idle', carrying: false });
    expect(memberAt(plan, t.stampAt + 100)).toMatchObject({ clip: 'idle', carrying: false });
    expect(memberAt(plan, t.stampAt + WAVE_MS + 500)).toMatchObject({ clip: 'walk' });
    expect(memberAt(plan, t.total + 1).gone).toBe(true);
    expect(memberAt(plan, t.total - 1).gone).toBe(false);
  });

  it('holds the folder in its hands, glides it into the tray, then leaves it to the stack', () => {
    expect(folderAt(plan, 100, 0).state).toBe('held');
    expect(folderAt(plan, t.walkEnd - 10, 0).state).toBe('held');
    const glide = folderAt(plan, t.turnEnd + GLIDE_MS / 2, 0);
    expect(glide.state).toBe('glide');
    expect(glide.y).toBeGreaterThan(plan.places.tray[1]);
    expect(folderAt(plan, t.placeAt, 0).state).toBe('hidden');
    const landing = folderAt(plan, t.placeAt - 1, 2);
    expect(landing.x).toBeCloseTo(plan.places.tray[0], 1);
    expect(landing.y).toBeCloseTo(plan.places.tray[1] + 2 * FOLDER_THICKNESS, 2);
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
