import { describe, expect, it } from 'vitest';
import {
  RENEW_TICK_MS,
  RENEW_WITHIN_MS,
  needsRenewal,
  sizeOf,
} from '../../apps/web/src/features/terminal/terminal-lease.js';

describe('sizeOf', () => {
  it('keeps the terminal size from the snapshot so a renewal never resizes the PTY', () => {
    const snapshot = JSON.stringify({ dimensions: { cols: 120, rows: 40 } });
    expect(sizeOf(snapshot)).toEqual({ cols: 120, rows: 40 });
  });

  it('falls back to 80x24 when there is no snapshot yet', () => {
    expect(sizeOf(null)).toEqual({ cols: 80, rows: 24 });
    expect(sizeOf('not json')).toEqual({ cols: 80, rows: 24 });
  });
});

describe('needsRenewal', () => {
  const now = 1_000_000;

  it('leaves a fresh lease alone', () => {
    expect(needsRenewal(now + 30_000, now)).toBe(false);
  });

  it('renews once the lease is within the renew window', () => {
    expect(needsRenewal(now + RENEW_WITHIN_MS, now)).toBe(true);
    expect(needsRenewal(now + RENEW_WITHIN_MS - 1, now)).toBe(true);
  });

  it('renews an expired or missing lease so the page can see it is still held', () => {
    expect(needsRenewal(now - 1, now)).toBe(true);
    expect(needsRenewal(null, now)).toBe(true);
  });

  it('checks often enough that a lease cannot run out between two checks', () => {
    expect(RENEW_TICK_MS).toBeLessThan(RENEW_WITHIN_MS);
  });
});
