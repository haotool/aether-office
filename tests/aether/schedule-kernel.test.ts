import { expect, it } from 'vitest';
import {
  dueDecision,
  isValidSpec,
  isValidTimezone,
  nextRun,
} from '../../packages/kernel/src/index.js';

const utc = (iso: string) => Date.parse(iso);

it('Asia/Taipei (UTC+8, no DST): daily 09:00 local is 01:00 UTC', () => {
  const spec = { kind: 'daily', time: '09:00' } as const;
  expect(nextRun(spec, utc('2026-10-03T00:00:00Z'))).toBe(utc('2026-10-03T01:00:00Z'));
  expect(nextRun(spec, utc('2026-10-03T01:00:00Z'))).toBe(utc('2026-10-04T01:00:00Z'));
  expect(nextRun(spec, utc('2026-10-03T23:30:00Z'))).toBe(utc('2026-10-04T01:00:00Z'));
});

it('weekly schedules respect the local weekday, not the UTC weekday', () => {
  const spec = { kind: 'weekly', days: [1], time: '00:30' } as const;
  const next = nextRun(spec, utc('2026-10-03T00:00:00Z'))!;
  expect(new Date(next).toISOString()).toBe('2026-10-04T16:30:00.000Z');
});

it('handles DST: spring-forward gap is skipped and fall-back picks the first occurrence', () => {
  const tz = 'America/New_York';
  const gap = { kind: 'daily', time: '02:30' } as const;
  expect(nextRun(gap, utc('2026-03-08T00:00:00Z'), tz)).toBe(utc('2026-03-09T06:30:00Z'));
  const ambiguous = { kind: 'daily', time: '01:30' } as const;
  expect(nextRun(ambiguous, utc('2026-11-01T00:00:00Z'), tz)).toBe(utc('2026-11-01T05:30:00Z'));
});

it('one-off schedules fire once and then have no next run', () => {
  expect(nextRun({ kind: 'once', at: 5000 }, 1000)).toBe(5000);
  expect(nextRun({ kind: 'once', at: 5000 }, 5000)).toBeNull();
});

it('missed occurrences collapse to one catch-up, or none when skipped', () => {
  const spec = { kind: 'daily', time: '09:00' } as const;
  const due = utc('2026-10-01T01:00:00Z');
  const now = utc('2026-10-05T03:00:00Z');
  const single = dueDecision(spec, 'Asia/Taipei', due, now, 'single');
  expect(single).toMatchObject({ dispatch: true, occurrence: utc('2026-10-05T01:00:00Z') });
  expect(single.nextAt).toBe(utc('2026-10-06T01:00:00Z'));
  expect(dueDecision(spec, 'Asia/Taipei', due, now, 'skip').dispatch).toBe(false);
  expect(dueDecision(spec, 'Asia/Taipei', due, due + 30_000, 'skip').dispatch).toBe(true);
});

it('validates timezones and specs', () => {
  expect(isValidTimezone('Asia/Taipei')).toBe(true);
  expect(isValidTimezone('Mars/Base')).toBe(false);
  expect(isValidSpec({ kind: 'daily', time: '24:00' })).toBe(false);
  expect(isValidSpec({ kind: 'weekly', days: [], time: '09:00' })).toBe(false);
  expect(isValidSpec({ kind: 'weekly', days: [7], time: '09:00' })).toBe(false);
  expect(isValidSpec({ kind: 'weekly', days: [0, 6], time: '09:00' })).toBe(true);
});
