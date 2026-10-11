import { describe, expect, it } from 'vitest';
import {
  caretOn,
  easeToward,
  editPosition,
  hunksOf,
  readTarget,
  typedChars,
  typingCycle,
} from '../../packages/office-scene/src/screen/screen-motion.js';
import { generateFile } from '../../packages/office-scene/src/screen/screen-codegen.js';

describe('typing cadence', () => {
  it('is the same for the same seed and moment, and differs between members', () => {
    expect(typedChars('a', 12_345)).toBe(typedChars('a', 12_345));
    const samples = [5_000, 20_000, 33_333].map((t) => typedChars('a', t) - typedChars('b', t));
    expect(samples.some((d) => d !== 0)).toBe(true);
  });

  it('only ever moves forward, and starts at nothing', () => {
    expect(typedChars('a', 0)).toBe(0);
    let last = 0;
    for (let t = 0; t < 120_000; t += 137) {
      const now = typedChars('a', t);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it('comes in bursts with pauses: stretches of no typing between stretches of fast typing', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const { segments } = typingCycle(seed);
      expect(segments.some((s) => s.cps === 0 && s.ms >= 600)).toBe(true);
      const typing = segments.filter((s) => s.cps > 0);
      expect(typing.length).toBeGreaterThan(8);
      for (const s of typing) {
        expect(s.cps).toBeGreaterThanOrEqual(3);
        expect(s.cps).toBeLessThanOrEqual(12);
      }
    }
  });

  it('averages a human speed, and a busier member types faster', () => {
    const slow = typedChars('a', 300_000, 1) / 300;
    const fast = typedChars('a', 300_000, 1.75) / 300;
    expect(slow).toBeGreaterThan(2);
    expect(slow).toBeLessThan(9);
    expect(fast / slow).toBeGreaterThan(1.6);
    expect(fast / slow).toBeLessThan(1.9);
  });

  it('blinks the caret about once a second', () => {
    const on = Array.from({ length: 100 }, (_, i) => caretOn(i * 100)).filter(Boolean).length;
    expect(on).toBeGreaterThan(40);
    expect(on).toBeLessThan(75);
  });
});

describe('where the typing is', () => {
  const lines = generateFile('a', 'app.ts', 'ts');
  const hunks = hunksOf(lines, 'a', 'app.ts');

  it('picks a few separate hunks inside the file', () => {
    expect(hunks.length).toBeGreaterThanOrEqual(3);
    hunks.forEach((h, i) => {
      expect(h.start).toBeGreaterThanOrEqual(0);
      expect(h.start + h.length).toBeLessThanOrEqual(lines.length);
      if (i) expect(h.start).toBeGreaterThanOrEqual(hunks[i - 1]!.start + hunks[i - 1]!.length);
    });
  });

  it('walks line by line through a hunk and then jumps to the next', () => {
    const seen = new Set<number>();
    let jumps = 0;
    let previous = -1;
    for (let c = 0; c < 1500; c += 3) {
      const at = editPosition(lines, hunks, c);
      seen.add(at.hunk);
      expect(at.line).toBeGreaterThanOrEqual(hunks[at.hunk]!.start);
      expect(at.line).toBeLessThan(hunks[at.hunk]!.start + hunks[at.hunk]!.length);
      expect(at.column).toBeGreaterThanOrEqual(0);
      if (previous !== -1 && at.hunk !== previous) jumps++;
      previous = at.hunk;
    }
    expect(seen.size).toBe(hunks.length);
    expect(jumps).toBeGreaterThanOrEqual(hunks.length - 1);
  });
});

it('eases toward a target without overshooting, and reading targets stay in range', () => {
  let at = 0;
  for (let i = 0; i < 40; i++) {
    const next = easeToward(at, 100, 100);
    expect(next).toBeGreaterThan(at);
    expect(next).toBeLessThanOrEqual(100);
    at = next;
  }
  expect(at).toBeGreaterThan(99);
  for (let t = 0; t < 600_000; t += 3_000) {
    const target = readTarget('a', t, 400);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(target).toBeLessThanOrEqual(400);
  }
  expect(readTarget('a', 10_000, 400)).toBe(readTarget('a', 10_500, 400));
});
