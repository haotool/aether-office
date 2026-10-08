import { expect, it } from 'vitest';
import {
  NEW_TRACKER,
  observe,
  type Compaction,
  type ContextReading,
  type Tracker,
} from '../../apps/web/src/features/conversation/compaction.js';
import { compactionLabel } from '../../packages/office-scene/src/environment/compaction-label.js';
import {
  COMPACTION_SECONDS,
  contextLevel,
  easeOut,
  tweenSeconds,
} from '../../packages/office-scene/src/environment/context.js';

const T0 = 1_800_000_000_000;
const W = 200_000;
/** Feeds readings one second apart; returns the events and the final tracker. */
function run(readings: ContextReading[], start: Tracker = NEW_TRACKER, base = T0, step = 1000) {
  let tracker = start;
  const events: (Compaction | null)[] = [];
  readings.forEach((r, i) => {
    const out = observe(tracker, { at: base + i * step, ...r });
    tracker = out.tracker;
    events.push(out.event);
  });
  return { events, tracker };
}
const reading = (used: number | null, over: Partial<ContextReading> = {}): ContextReading => ({
  used,
  window: W,
  compactedAt: null,
  ...over,
});

it('fires on a large fall in the context in use, with the share before and after', () => {
  const { events } = run([reading(170_000), reading(171_000), reading(20_000)]);
  expect(events.slice(0, 2)).toEqual([null, null]);
  expect(events[2]).toMatchObject({ kind: 'drop', fromPct: 85.5, toPct: 10 });
});

it('fires on the CLI marker even before the context number has dropped', () => {
  const { events } = run([
    reading(150_000),
    reading(150_000, { compactedAt: T0 + 1500 }),
    reading(150_000, { compactedAt: T0 + 1500 }), // the same marker is not a second compaction
  ]);
  expect(events[1]).toMatchObject({ kind: 'marker', key: T0 + 1500 });
  expect(events[2]).toBeNull();
});

it('counts the fall that follows the marker as the same compaction', () => {
  const { events } = run([
    reading(150_000),
    reading(150_000, { compactedAt: T0 + 1500 }),
    reading(12_000, { compactedAt: T0 + 1500 }),
  ]);
  expect(events.map((e) => e?.kind ?? null)).toEqual([null, 'marker', null]);
});

it('fires again for a later compaction once the first has settled', () => {
  const first = run([reading(150_000), reading(10_000)]);
  const later = run([reading(190_000), reading(15_000)], first.tracker, T0 + 100_000);
  expect(first.events[1]?.kind).toBe('drop');
  expect(later.events[1]?.kind).toBe('drop');
});

it('ignores noise: gradual falls, and falls under the token floor', () => {
  const { events } = run([
    reading(100_000),
    reading(80_000), // less than half
    reading(60_000), // still not under half of the previous reading
    reading(40_000),
    reading(30_000),
  ]);
  expect(events.every((e) => e === null)).toBe(true);
  const tiny = run([reading(30_000), reading(5_000)]); // a fall of more than half and of 25k tokens
  expect(tiny.events[1]?.kind).toBe('drop');
  const below = run([reading(30_000), reading(11_000)]); // 19k lost: under the floor
  expect(below.events[1]).toBeNull();
});

it('does not fire for a new session, nor for readings that are unknown', () => {
  expect(run([reading(5_000)]).events).toEqual([null]);
  expect(run([reading(null), reading(3_000), reading(null)]).events).toEqual([null, null, null]);
});

it('does not take a model switch to a different window for a compaction', () => {
  const { events } = run([reading(180_000), reading(40_000, { window: 1_000_000 })]);
  expect(events[1]).toBeNull();
});

it('treats a marker already in the tail when a session first appears as news only when fresh', () => {
  const fresh = observe(NEW_TRACKER, { at: T0, used: 9_000, window: W, compactedAt: T0 - 5_000 });
  expect(fresh.event?.kind).toBe('marker');
  const old = observe(NEW_TRACKER, { at: T0, used: 9_000, window: W, compactedAt: T0 - 3_600_000 });
  expect(old.event).toBeNull();
  // and the old marker, now remembered, never fires later
  const later = observe(old.tracker, {
    at: T0 + 5000,
    used: 9_500,
    window: W,
    compactedAt: T0 - 3_600_000,
  });
  expect(later.event).toBeNull();
});

it('steps the context colour: calm under 60, warm from 60 to 85, hot above', () => {
  expect(contextLevel(0)).toBe('calm');
  expect(contextLevel(59.9)).toBe('calm');
  expect(contextLevel(60)).toBe('warm');
  expect(contextLevel(85)).toBe('warm');
  expect(contextLevel(85.1)).toBe('hot');
  expect(contextLevel(100)).toBe('hot');
});

it('words the chip in both languages and eases the tween', () => {
  expect(compactionLabel({ key: 1, fromPct: 88.4, toPct: 24 }, false)).toBe('compacted −64%');
  expect(compactionLabel({ key: 1, fromPct: 88, toPct: 24 }, true)).toBe('已壓縮 −64%');
  expect(compactionLabel({ key: 1, fromPct: null, toPct: 24 }, false)).toBe('compacted');
  expect(compactionLabel({ key: 1, fromPct: 30, toPct: 30 }, false)).toBe('compacted');
  expect(easeOut(-1)).toBe(0);
  expect(easeOut(2)).toBe(1);
  expect(easeOut(0.5)).toBeGreaterThan(0.5);
  expect(tweenSeconds(10, 11)).toBeLessThan(tweenSeconds(88, 24));
  expect(tweenSeconds(88, 24)).toBeLessThan(COMPACTION_SECONDS);
});
