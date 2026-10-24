import { describe, expect, it } from 'vitest';
import {
  announce,
  drain,
  emptyLogQueue,
  LOG_GAP_MS,
  nextDrainIn,
} from '../../packages/office-scene/src/core/aria-log.js';

describe('the aria log queue', () => {
  it('announces the first line at once and holds the next until 5 s have passed', () => {
    let log = announce(announce(emptyLogQueue, 'one'), 'two');
    const first = drain(log, 1000);
    expect(first.line).toBe('one');
    log = first.log;
    expect(drain(log, 1000 + LOG_GAP_MS - 1).line).toBeNull();
    expect(nextDrainIn(log, 1000 + 1000)).toBe(LOG_GAP_MS - 1000);
    const second = drain(log, 1000 + LOG_GAP_MS);
    expect(second.line).toBe('two');
    expect(nextDrainIn(second.log, 9999)).toBeNull();
  });

  it('announces nothing when nothing waits', () => {
    expect(drain(emptyLogQueue, 5).line).toBeNull();
  });
});
