import { expect, it } from 'vitest';
import { keepIfEqual } from '../../packages/office-scene/src/use-by-value.js';

it('keepIfEqual keeps the held tuple while the numbers are the same and takes the new one when they change', () => {
  const held: [number, number, number] = [1, 2, 3];
  expect(keepIfEqual(held, [1, 2, 3])).toBe(held);
  const moved: [number, number, number] = [1, 2, 4];
  expect(keepIfEqual(held, moved)).toBe(moved);
  expect(keepIfEqual([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
});
