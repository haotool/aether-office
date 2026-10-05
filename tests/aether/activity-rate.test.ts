import { describe, expect, it } from 'vitest';
import { intensityOf, newBeatLog, recordBeats } from '../../apps/web/src/features/activity-rate.js';
import type { AttributedSession } from '../../packages/contracts/src/index.js';

const session = (over: Partial<AttributedSession> = {}) =>
  ({
    key: 'claude:a',
    mtime: 1,
    hook: null,
    resources: null,
    subagents: [],
    ...over,
  }) as unknown as AttributedSession;

describe('how hard a session works', () => {
  it('counts the changes seen between looks, over the last minute only', () => {
    const log = newBeatLog();
    expect(recordBeats(log, [session({ mtime: 1 })], 0).get('claude:a')).toBe(0); // the first look is not a change
    expect(recordBeats(log, [session({ mtime: 2 })], 5_000).get('claude:a')).toBe(1);
    expect(recordBeats(log, [session({ mtime: 2 })], 10_000).get('claude:a')).toBe(1); // unchanged: no new beat
    expect(recordBeats(log, [session({ mtime: 3 })], 15_000).get('claude:a')).toBe(2);
    expect(recordBeats(log, [session({ mtime: 3 })], 70_000).get('claude:a')).toBe(1); // the first beat has aged out
  });

  it('is calm unless the session is working, and rises with beats, CPU and subagents', () => {
    const now = 1_000_000;
    expect(intensityOf(session(), false, 30, now)).toBe(0);
    expect(intensityOf(session(), true, 0, now)).toBe(1);
    expect(intensityOf(session(), true, 6, now)).toBe(2);
    expect(intensityOf(session({ resources: { cpuPercent: 60, rssBytes: 1 } }), true, 0, now)).toBe(
      2,
    );
    const helpers = [
      { id: 'a', type: 'x', lastSeen: now - 1000 },
      { id: 'b', type: 'x', lastSeen: now - 2000 },
    ];
    expect(intensityOf(session({ subagents: helpers }), true, 3, now)).toBe(3);
    // A subagent that has gone quiet no longer counts.
    expect(
      intensityOf(
        session({ subagents: [{ id: 'a', type: 'x', lastSeen: now - 60_000 }] }),
        true,
        0,
        now,
      ),
    ).toBe(1);
  });
});
