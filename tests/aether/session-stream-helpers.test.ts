import { describe, expect, it } from 'vitest';
import { seqOf, streamUrl, usageDelay } from '../../apps/web/src/hooks/use-session-stream.js';

describe('session stream helpers', () => {
  it('spaces token KPI refetches 5 seconds apart', () => {
    expect(usageDelay(0, 100_000)).toBe(0);
    expect(usageDelay(10_000, 12_000)).toBe(3_000);
  });
  it('resumes after the last change seen', () => {
    expect(streamUrl(null)).toBe('/api/local-sessions/stream');
    expect(streamUrl(42)).toBe('/api/local-sessions/stream?after=42');
  });
  it('reads the seq of an event', () => {
    expect(seqOf({ data: '{"seq":7}' } as unknown as Event)).toBe(7);
  });
});
