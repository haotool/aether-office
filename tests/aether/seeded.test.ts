import { describe, expect, it } from 'vitest';
import { between, pick, weighted } from '../../packages/office-scene/src/pick.js';
import { hashText } from '../../packages/office-scene/src/hash.js';
import { seeded } from '../../packages/office-scene/src/seeded.js';

describe('seeded', () => {
  it('repeats the same sequence for the same seed and stays in [0, 1)', () => {
    const a = seeded('x');
    const b = seeded('x');
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hashText('x')).toBe(hashText('x'));
    expect(hashText('x')).not.toBe(hashText('y'));
  });

  it('between stays within bounds', () => {
    const r = seeded('between');
    for (let i = 0; i < 50; i++) expect(between(r, 2, 5)).toBeGreaterThanOrEqual(2);
  });
});

describe('pick and weighted', () => {
  it('pick returns a member and refuses an empty list', () => {
    const r = seeded('pick');
    for (let i = 0; i < 30; i++) expect(['a', 'b', 'c']).toContain(pick(r, ['a', 'b', 'c']));
    expect(() => pick(r, [])).toThrow(RangeError);
  });

  it('weighted never returns a zero weight and refuses all-zero weights', () => {
    const r = seeded('weighted');
    for (let i = 0; i < 100; i++) expect(weighted(r, { a: 0, b: 1, c: 2 })).not.toBe('a');
    expect(() => weighted(r, { a: 0 })).toThrow(RangeError);
  });
});
