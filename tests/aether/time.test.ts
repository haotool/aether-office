import { expect, it } from 'vitest';
import { DAY_MS, MINUTE_MS, formatAgo } from '../../packages/kernel/src/index.js';

it('says how long ago in both languages', () => {
  expect(formatAgo(20_000, 'en')).toBe('just now');
  expect(formatAgo(20_000, 'zh-TW')).toBe('剛剛');
  expect(formatAgo(3 * MINUTE_MS, 'en')).toBe('3 min ago');
  expect(formatAgo(3 * MINUTE_MS, 'zh-TW')).toBe('3 分鐘前');
  expect(formatAgo(2 * DAY_MS, 'en')).toBe('2 d ago');
});
