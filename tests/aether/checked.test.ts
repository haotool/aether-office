import { describe, expect, it } from 'vitest';
import { itemAt, lastOf, valueOf } from '../../packages/office-scene/src/environment/checked.js';

describe('checked reads', () => {
  it('returns the element in range, for arrays, typed arrays and strings', () => {
    expect(itemAt([3, 4], 1)).toBe(4);
    expect(itemAt(new Float32Array([1.5]), 0)).toBe(1.5);
    expect(itemAt('ab', 1)).toBe('b');
    expect(lastOf([1, 2, 3])).toBe(3);
  });

  it('throws a RangeError instead of returning undefined', () => {
    expect(() => itemAt([1], 1)).toThrow(RangeError);
    expect(() => itemAt([1], -1)).toThrow(RangeError);
    expect(() => lastOf([])).toThrow(RangeError);
  });

  it('valueOf reads a present key and throws on a missing one', () => {
    const map = new Map([['a', 1]]);
    expect(valueOf(map, 'a')).toBe(1);
    expect(() => valueOf(map, 'b')).toThrow(RangeError);
  });
});
