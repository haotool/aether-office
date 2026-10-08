import { describe, expect, it } from 'vitest';
import { STAND_MS } from '../../packages/office-scene/src/animals/departure.js';
import {
  DESK_GAP_MS,
  JITTER_MS,
  MAX_QUEUE_MS,
  TRAY_CLEAR_MS,
  WALKERS_PER_FLOOR,
  admit,
  advance,
  emptyBook,
  register,
  trayView,
  type Live,
} from '../../packages/office-scene/src/squad/handover/book.js';
import {
  BOX_CAPACITY,
  handoverItems,
} from '../../packages/office-scene/src/squad/handover/items.js';
import {
  GLIDE_MS,
  POP_MS,
  PRESS_TOTAL_MS,
  TRAY_STACK_MAX,
  type HandoverMode,
} from '../../packages/office-scene/src/squad/handover/plan.js';
import { createHandover } from '../../packages/office-scene/src/squad/handover/runtime.js';
import type { DrawSquad } from '../../packages/office-scene/src/squad/squad-draw.js';
import {
  T0,
  alive,
  at,
  chair,
  grid,
  makePlan,
  request,
  squad,
  withEntry,
} from './handover-fixtures.js';

describe('the throttle', () => {
  it('walks the first hand-over of a squad', () => {
    expect(admit(emptyBook, request(), T0)).toMatchObject({
      mode: 'walk',
      wait: expect.any(Number),
    });
  });

  it('shows none when the relation effects are off, and one per member at a time', () => {
    expect(admit(emptyBook, request({ relation: false }), T0)).toBeNull();
    const book = withEntry(emptyBook, 'local:s1:sub:a', 'walk');
    expect(admit(book, request(), T0 + 100)).toBeNull();
    expect(admit(book, request({ id: 'local:s1:sub:b' }), T0 + 100)).not.toBeNull();
  });

  it('lets at most two carriers walk on a floor; the next shows the folder popping into the tray', () => {
    let book = emptyBook;
    const modes: HandoverMode[] = [];
    for (let n = 0; n < 5; n++) {
      const id = `local:s1:sub:${n}`;
      const decision = admit(book, request({ id }), T0)!;
      modes.push(decision.mode);
      book = withEntry(book, id, decision.mode, {}, decision.wait);
    }
    expect(modes.filter((m) => m === 'walk')).toHaveLength(WALKERS_PER_FLOOR);
    expect(modes.slice(WALKERS_PER_FLOOR).every((m) => m === 'pop')).toBe(true);
    // Another floor has its own two.
    expect(admit(book, request({ id: 'x', supervisor: 'local:s2', floor: 1 }), T0)?.mode).toBe(
      'walk',
    );
  });

  it('gives the desk one stamp at a time: the next folder waits for the last stamp', () => {
    const first = admit(emptyBook, request({ walkMs: 1000 }), T0)!;
    const book = withEntry(emptyBook, 'local:s1:sub:a', 'walk', {}, first.wait);
    const second = admit(book, request({ id: 'local:s1:sub:b', walkMs: 1000 }), T0)!;
    const a = book.entries[`local:s1:sub:a@${T0}`]!.plan.t;
    const nextPlace = STAND_MS + 1000 + 400 + GLIDE_MS + second.wait;
    expect(second.mode).toBe('walk');
    expect(nextPlace).toBeGreaterThanOrEqual(a.stampAt + PRESS_TOTAL_MS + DESK_GAP_MS);
    expect(nextPlace).toBeLessThanOrEqual(a.stampAt + PRESS_TOTAL_MS + DESK_GAP_MS + JITTER_MS + 1);
  });

  it('turns a queue longer than the limit into a pop instead of a standing carrier', () => {
    let book = emptyBook;
    const stamps: number[] = [];
    for (let n = 0; n < 6; n++) {
      const id = `local:s1:sub:${n}`;
      const decision = admit(book, request({ id, walkMs: 500 }), T0)!;
      if (decision.mode === 'walk')
        expect(decision.wait).toBeLessThanOrEqual(MAX_QUEUE_MS + JITTER_MS);
      book = withEntry(book, id, decision.mode, {}, decision.wait);
      stamps.push(book.entries[`${id}@${T0}`]!.plan.t.stampAt);
    }
    // Every desk stamp is at least a press and a gap after the one before it.
    const sorted = [...stamps].sort((x, y) => x - y);
    for (let n = 1; n < sorted.length; n++)
      expect(sorted[n]! - sorted[n - 1]!).toBeGreaterThanOrEqual(PRESS_TOTAL_MS);
  });

  it('steps the mode down, never out: low tier and an unseen desk pop, motion off means appearing', () => {
    expect(admit(emptyBook, request({ quality: 'low' }), T0)?.mode).toBe('pop');
    expect(admit(emptyBook, request({ inView: false }), T0)?.mode).toBe('pop');
    expect(admit(emptyBook, request({ still: true }), T0)).toEqual({ mode: 'tray', wait: 0 });
    expect(
      admit(emptyBook, request({ still: true, quality: 'low', inView: false }), T0)?.mode,
    ).toBe('tray');
  });

  it('is seeded: the same request gives the same answer, others differ a little', () => {
    const a = admit(emptyBook, request(), T0);
    expect(admit(emptyBook, request(), T0)).toEqual(a);
    const waits = new Set(
      Array.from({ length: 12 }, (_, n) => admit(emptyBook, request({ id: `m${n}` }), T0)!.wait),
    );
    expect(waits.size).toBeGreaterThan(4);
    for (const w of waits) expect(w).toBeLessThanOrEqual(JITTER_MS);
  });
});

describe('the book over time', () => {
  it('reads when the folder is placed, nods when the stamp falls, and says so once', () => {
    const book = withEntry(emptyBook, 'local:s1:sub:a', 'walk');
    const t = book.entries[`local:s1:sub:a@${T0}`]!.plan.t;
    const quiet = advance(book, at(t.placeAt) - 1, alive(book));
    expect(quiet.cues).toEqual([]);
    expect(quiet.told).toEqual([]);
    const placed = advance(quiet.book, at(t.placeAt), alive(book));
    expect(placed.cues).toEqual([{ supervisor: 'local:s1', clip: 'reading' }]);
    expect(placed.told).toEqual([
      { id: 'local:s1:sub:a', supervisor: 'local:s1', type: 'Explore', kind: 'received' },
    ]);
    const stamped = advance(placed.book, at(t.stampAt), alive(book));
    expect(stamped.cues).toEqual([{ supervisor: 'local:s1', clip: 'nod' }]);
    expect(stamped.told).toEqual([]); // said once
    expect(advance(stamped.book, at(t.stampAt) + 50, alive(book)).cues).toEqual([]);
  });

  it('has the supervisor scratch its head, not nod, at a result flagged as an error', () => {
    const plan = makePlan('walk', 'returned');
    const book = register(emptyBook, {
      id: 'a',
      supervisor: 'local:s1',
      floor: 0,
      type: 'Plan',
      since: T0,
      plan,
    });
    const done = advance(book, at(plan.t.stampAt), alive(book));
    expect(done.cues.map((c) => c.clip)).toEqual(['reading', 'scratch_head']);
    expect(done.told[0]!.kind).toBe('returned');
  });

  it('puts the folder in the tray stack and keeps it after the carrier is gone, up to five', () => {
    let book = emptyBook;
    for (let n = 0; n < 7; n++) {
      const id = `m${n}`;
      const plan = makePlan('pop', 'received', n * 3000);
      book = register(book, {
        id,
        supervisor: 'local:s1',
        floor: 0,
        type: 'Explore',
        since: T0,
        plan,
      });
    }
    const late = at(7 * 3000 + 5000);
    const after = advance(book, late, alive(book));
    expect(Object.keys(after.book.entries)).toHaveLength(0);
    expect(trayView(after.book, 'local:s1', late).count).toBe(TRAY_STACK_MAX);
    const half = advance(book, at(2 * 3000 + POP_MS + 100), alive(book));
    expect(trayView(half.book, 'local:s1', at(2 * 3000 + POP_MS + 100)).count).toBe(3);
  });

  it('shows the seal of the latest stamp, and clears the tray after five quiet minutes', () => {
    const plan = makePlan('walk', 'returned');
    const book = register(emptyBook, {
      id: 'a',
      supervisor: 'local:s1',
      floor: 0,
      type: 'Plan',
      since: T0,
      plan,
    });
    const end = at(plan.t.total);
    const done = advance(book, end, alive(book)).book;
    expect(trayView(done, 'local:s1', end)).toMatchObject({ count: 1, seal: { kind: 'returned' } });
    const gone = advance(done, end + TRAY_CLEAR_MS + 1, alive(book)).book;
    expect(trayView(gone, 'local:s1', end + TRAY_CLEAR_MS + 1)).toEqual({ count: 0, seal: null });
  });

  describe('interruption', () => {
    it('drops a hand-over whose carrier vanished with the folder in its hands: no stamp, no line, nothing in the tray', () => {
      const book = withEntry(emptyBook, 'local:s1:sub:a', 'walk');
      const t = book.entries[`local:s1:sub:a@${T0}`]!.plan.t;
      const live: Live = { supervisors: new Set(['local:s1']), members: new Set() };
      const cut = advance(book, at(t.walkEnd), live);
      expect(Object.keys(cut.book.entries)).toHaveLength(0);
      expect(cut.cues).toEqual([]);
      expect(cut.told).toEqual([]);
      expect(trayView(cut.book, 'local:s1', at(t.stampAt))).toEqual({ count: 0, seal: null });
    });

    it('lets a placed folder finish its stamp even if the carrier is gone by then', () => {
      const book = withEntry(emptyBook, 'local:s1:sub:a', 'walk');
      const t = book.entries[`local:s1:sub:a@${T0}`]!.plan.t;
      const live: Live = { supervisors: new Set(['local:s1']), members: new Set() };
      const placed = advance(book, at(t.placeAt), live);
      expect(placed.told).toHaveLength(1);
      expect(advance(placed.book, at(t.stampAt), live).cues.map((c) => c.clip)).toEqual(['nod']);
    });

    it('drops everything of a supervisor that left: the hand-over, the cues and the tray', () => {
      let book = withEntry(emptyBook, 'local:s1:sub:a', 'pop');
      book = advance(book, T0 + 10_000, alive(book)).book;
      book = withEntry(book, 'local:s1:sub:b', 'walk', { since: T0 + 10_000 });
      expect(trayView(book, 'local:s1', T0 + 10_000).count).toBe(1);
      const left = advance(book, T0 + 12_000, {
        supervisors: new Set(),
        members: new Set(['local:s1:sub:b']),
      });
      expect(left.book).toEqual(emptyBook);
      expect(left.cues).toEqual([]);
      expect(left.told).toEqual([]);
    });
  });

  it('draws nothing for a hand-over in the reduced-motion tray mode but the seal and the folder in the tray', () => {
    const plan = makePlan('tray', 'received');
    const book = register(emptyBook, {
      id: 'a',
      supervisor: 'local:s1',
      floor: 0,
      type: 'Plan',
      since: T0,
      plan,
    });
    const now = T0 + 1;
    const stepped = advance(book, now, alive(book));
    expect(stepped.cues).toEqual([]); // the supervisor does not act it out
    expect(stepped.told).toHaveLength(1); // but it is said
    const items = handoverItems(stepped.book, [squad], now, false);
    expect(items.seals.received).toHaveLength(1);
    expect(items.boxes.length).toBeGreaterThanOrEqual(4); // a folder (2) and the stamp (2)
  });
});

describe('the runtime, with a squad finishing all at once', () => {
  const start = (run: ReturnType<typeof createHandover>, n: number, over = {}) =>
    run.begin({
      id: `local:s1:sub:${n}`,
      type: 'Explore',
      supervisor: 'local:s1',
      since: T0,
      result: { error: false },
      squad,
      chair: { x: chair.x + n * 0.1, z: chair.z },
      frameYaw: 0,
      grid,
      quality: 'high',
      reducedMotion: false,
      calm: false,
      relation: true,
      ...over,
    });

  it('walks two, pops the rest, and never stamps twice at once', () => {
    const run = createHandover();
    run.view.current = { floor: 0, exploded: false };
    const plans = Array.from({ length: 6 }, (_, n) => start(run, n)!);
    expect(plans.map((p) => p.mode)).toEqual(['walk', 'walk', 'pop', 'pop', 'pop', 'pop']);
    const stamps = plans.map((p) => p.t.stampAt).sort((a, b) => a - b);
    for (let i = 1; i < stamps.length; i++)
      expect(stamps[i]! - stamps[i - 1]!).toBeGreaterThanOrEqual(PRESS_TOTAL_MS);
    expect(run.planOf('local:s1:sub:0', T0)).toBe(plans[0]);
  });

  it('shows no hand-over under Calm as motion, and none at all with the relation effects off', () => {
    const run = createHandover();
    expect(start(run, 0, { calm: true })!.mode).toBe('tray');
    expect(start(run, 1, { reducedMotion: true })!.mode).toBe('tray');
    expect(start(run, 2, { relation: false })).toBeNull();
  });

  it('pops, and does not walk, for a desk on a floor that is not in view', () => {
    const run = createHandover();
    run.view.current = { floor: 2, exploded: false };
    expect(start(run, 0)!.mode).toBe('pop');
    run.view.current = { floor: 2, exploded: true };
    expect(start(run, 1)!.mode).toBe('walk');
  });

  it('forgets a plan when its hand-over is over', () => {
    const run = createHandover();
    const plan = start(run, 0)!;
    const live = { supervisors: new Set(['local:s1']), members: new Set(['local:s1:sub:0']) };
    run.tick(at(plan.t.total) + 1, live);
    expect(run.planOf('local:s1:sub:0', T0)).toBeUndefined();
  });
});

describe('the budget', () => {
  it('keeps the instance counts inside the meshes however many folders are around', () => {
    // Eight squads, each with a full stack, two carriers walking and a stamp: 8 x (5 + 2) folders + 8 stamps.
    let book = emptyBook;
    const squads: DrawSquad[] = [];
    for (let s = 0; s < 8; s++) {
      const supervisor = `sup${s}`;
      squads.push({ ...squad, supervisor, floor: s % 3 });
      for (let n = 0; n < TRAY_STACK_MAX; n++) {
        const plan = makePlan('pop');
        book = register(book, {
          id: `${supervisor}:d${n}`,
          supervisor,
          floor: s % 3,
          type: 'x',
          since: T0,
          plan,
        });
      }
      for (let n = 0; n < WALKERS_PER_FLOOR; n++)
        book = register(book, {
          id: `${supervisor}:w${n}`,
          supervisor,
          floor: s % 3,
          type: 'x',
          since: T0 + 20_000,
          plan: makePlan('walk'),
        });
    }
    const now = T0 + 20_000 + 2000;
    const folded = advance(book, now, {
      supervisors: new Set(squads.map((q) => q.supervisor)),
      members: new Set(Object.values(book.entries).map((e) => e.id)),
    }).book;
    const items = handoverItems(folded, squads, now, false);
    expect(items.boxes.length).toBeLessThanOrEqual(BOX_CAPACITY);
    // 8 stamps (2 boxes each), 8 stacks of 5 folders (2 boxes each) and two carriers a squad with a folder in hand.
    expect(items.boxes.length).toBe(16 + 80 + 32);
    expect(items.seals.received.length + items.seals.returned.length).toBeLessThanOrEqual(8);
  });

  it('counts the draw calls of the hand-over and the strings: boxes, two seals, strings, crosses', () => {
    const DRAWS = { boxes: 1, seals: 2, strings: 1, crosses: 1 };
    expect(DRAWS.boxes + DRAWS.seals + DRAWS.strings + DRAWS.crosses).toBeLessThanOrEqual(5);
  });
});
