import { expect, it } from 'vitest';
import { POLL, driveMs, poll, pollBy, pollMs } from '../../apps/web/src/lib/app/polling.js';

const looked = <T>(data: T, error: Error | null = null) => ({ state: { data, error } });

it('asks again every so often, or never', () => {
  expect(poll(POLL.list)).toEqual({ refetchInterval: 5000 });
  expect(poll(false)).toEqual({ refetchInterval: false });
});

it('lets what was answered so far choose the wait', () => {
  const { refetchInterval } = pollBy((data: { busy: boolean } | undefined, failed) =>
    failed ? false : data?.busy ? POLL.working : POLL.idle,
  );
  expect(refetchInterval(looked(undefined))).toBe(POLL.idle);
  expect(refetchInterval(looked({ busy: true }))).toBe(POLL.working);
  expect(refetchInterval(looked({ busy: true }, new Error('refused')))).toBe(false);
});

it('polls only as a safety net while live, and as asked otherwise', () => {
  expect(pollMs(true, 4000)).toBe(POLL.slow);
  expect(pollMs(false, 4000)).toBe(4000);
  expect(pollMs(false, false)).toBe(false);
});

it('watches a driven terminal closely while a reply is awaited or it is off its prompt', () => {
  expect(driveMs('idle', false)).toBe(POLL.driving);
  expect(driveMs('idle', true)).toBe(POLL.answer);
  expect(driveMs('working', false)).toBe(POLL.answer);
  expect(driveMs('unknown', false)).toBe(POLL.answer);
  expect(driveMs(undefined, false)).toBe(POLL.answer);
});

it('keeps the table in order of urgency', () => {
  const waits = Object.values(POLL);
  expect(waits).toEqual([...waits].sort((a, b) => a - b));
});
