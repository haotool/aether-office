import { expect, it } from 'vitest';
import { AIR, daylight, hourOf, tintAt } from '../../packages/office-scene/src/environment/air.js';

it('is dark at night, bright at midday and eases through dawn and dusk', () => {
  expect(daylight(2)).toBe(0);
  expect(daylight(13)).toBe(1);
  expect(daylight(23.5)).toBe(0);
  expect(daylight(6.5)).toBeGreaterThan(0);
  expect(daylight(6.5)).toBeLessThan(1);
  expect(daylight(18.5)).toBeGreaterThan(0);
  expect(daylight(18.5)).toBeLessThan(1);
  expect(daylight(-11)).toBe(daylight(13)); // hours wrap
});

it('tints the air cool blue at night and warm gold in the day', () => {
  const night = tintAt(1);
  const day = tintAt(13);
  expect(night[2]).toBeGreaterThan(night[0]);
  expect(day[0]).toBeGreaterThan(day[2]);
});

it('reads the local fractional hour of a date', () => {
  expect(hourOf(new Date(2026, 9, 6, 21, 30))).toBe(21.5);
});

it('draws no motes or shafts on low and fewer on balanced than on high', () => {
  expect(AIR.low).toEqual({ motes: 0, shafts: 0 });
  expect(AIR.balanced.motes).toBeLessThan(AIR.high.motes);
  expect(AIR.balanced.shafts).toBeLessThan(AIR.high.shafts);
});
