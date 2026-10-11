import { describe, expect, it } from 'vitest';
import {
  intensityOf,
  newBeatLog,
  recordBeats,
} from '../../apps/web/src/features/sessions/activity-rate.js';
import { subagentSchema, type AttributedSession } from '../../packages/contracts/src/index.js';

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
    expect(recordBeats(log, [session({ mtime: 1 })], 0).get('claude:a')).toBe(0);
    expect(recordBeats(log, [session({ mtime: 2 })], 5_000).get('claude:a')).toBe(1);
    expect(recordBeats(log, [session({ mtime: 2 })], 10_000).get('claude:a')).toBe(1);
    expect(recordBeats(log, [session({ mtime: 3 })], 15_000).get('claude:a')).toBe(2);
    expect(recordBeats(log, [session({ mtime: 3 })], 70_000).get('claude:a')).toBe(1);
  });

  it('is calm unless the session is working, and rises with beats, CPU and subagents', () => {
    const now = 1_000_000;
    expect(intensityOf(session(), false, 30, now)).toBe(0);
    expect(intensityOf(session(), true, 0, now)).toBe(1);
    expect(intensityOf(session(), true, 6, now)).toBe(2);
    expect(intensityOf(session({ resources: { cpuPercent: 60, rssBytes: 1 } }), true, 0, now)).toBe(
      2,
    );
    const helper = (id: string, lastSeen: number, status = 'running') =>
      subagentSchema.parse({ id, type: 'x', lastSeen, status });
    const helpers = [helper('a', now - 1000), helper('b', now - 2000)];
    expect(intensityOf(session({ subagents: helpers }), true, 3, now)).toBe(3);
    expect(
      intensityOf(
        session({ subagents: [...helpers, helper('c', now - 500, 'finished')] }),
        true,
        3,
        now,
      ),
    ).toBe(3);
    expect(
      intensityOf(session({ subagents: [helper('c', now - 500, 'finished')] }), true, 3, now),
    ).toBe(1);
    expect(intensityOf(session({ subagents: [helper('a', now - 60_000)] }), true, 0, now)).toBe(1);
  });
});
