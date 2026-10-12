import { describe, expect, it } from 'vitest';
import {
  deriveLifeSignals,
  emptyLifeMemory,
  type LifeMemory,
  type LifeSnapshot,
} from '../../apps/web/src/features/office/life-signals.js';
import { NOW, session, snap, type Call } from './life-sessions.js';

type Scan = Parameters<typeof session>;
const scan = (at: number, ...sessions: Scan[]) =>
  snap(
    at,
    sessions.map(([key, over]) => session(key, over)),
  );
const kinds = (r: { signals: { kind: string }[] }) => r.signals.map((s) => s.kind);
const ends = (r: { signals: { kind: string }[] }) => r.signals.filter((s) => s.kind === 'tool.end');
const test = (at: number, ok: boolean | null, over: Partial<Call> = {}): Call => ({
  tool: 'Bash',
  target: 'pnpm test',
  at,
  tags: ['test'],
  ok,
  ...over,
});

describe('deriveLifeSignals: real outcomes', () => {
  it('carries the tags on a tool.start, and says an outcome the first time it is known, with the call it belongs to', () => {
    const before = scan(NOW, ['a', { recent: [test(NOW - 3000, null)] }]);
    const after = scan(NOW + 4000, ['a', { recent: [test(NOW - 3000, false)] }]);
    expect(deriveLifeSignals(null, before).signals).toEqual([
      {
        kind: 'tool.start',
        member: 'local:a',
        at: NOW - 3000,
        tool: 'Bash',
        target: 'pnpm test',
        tags: ['test'],
      },
    ]);
    expect(deriveLifeSignals(before, after).signals).toEqual([
      {
        kind: 'tool.end',
        member: 'local:a',
        at: NOW + 4000,
        tool: 'Bash',
        target: 'pnpm test',
        tags: ['test'],
        ok: false,
      },
    ]);
  });

  it('says nothing for an outcome that is not known, or one that was already told', () => {
    const open = scan(NOW, ['a', { recent: [test(NOW - 3000, null)] }]);
    const still = scan(NOW + 4000, ['a', { recent: [test(NOW - 3000, null)] }]);
    expect(ends(deriveLifeSignals(open, still))).toEqual([]);
    const done = scan(NOW, ['a', { recent: [test(NOW - 3000, true)] }]);
    const later = scan(NOW + 4000, ['a', { recent: [test(NOW - 3000, true)] }]);
    expect(ends(deriveLifeSignals(done, later))).toEqual([]);
  });

  it('says a call that finished between two scans, drops stale news at the first scan and ignores a subagent', () => {
    const quick = scan(NOW + 4000, ['a', { recent: [test(NOW + 1000, true)] }]);
    expect(ends(deriveLifeSignals(scan(NOW, ['a']), quick))).toHaveLength(1);
    const fresh = scan(NOW, ['a', { recent: [test(NOW - 3000, true)] }]);
    expect(ends(deriveLifeSignals(null, fresh))).toHaveLength(1);
    const old = scan(NOW, ['a', { recent: [test(NOW - 90_000, true)] }]);
    expect(ends(deriveLifeSignals(null, old))).toEqual([]);
    const helper = test(NOW - 3000, true, { agentId: 'sub' });
    const before = scan(NOW, ['a', { recent: [{ ...helper, ok: null }] }]);
    expect(ends(deriveLifeSignals(before, scan(NOW + 4000, ['a', { recent: [helper] }])))).toEqual(
      [],
    );
  });

  it('says a repo that went from no conflicted files to some, once', () => {
    const clean = scan(NOW, ['a']);
    const merged = scan(NOW + 4000, ['a', { conflicts: 3 }]);
    expect(deriveLifeSignals(clean, merged).signals).toEqual([
      { kind: 'git.conflicts', member: 'local:a', at: NOW + 4000, value: 3 },
    ]);
    expect(kinds(deriveLifeSignals(merged, scan(NOW + 8000, ['a', { conflicts: 2 }])))).toEqual([]);
    expect(kinds(deriveLifeSignals(null, merged))).toEqual([]);
  });
});

describe('deriveLifeSignals: patterns made of real outcomes', () => {
  const MIN = 60_000;
  const walk = (scans: readonly LifeSnapshot[]) => {
    let memory: LifeMemory = emptyLifeMemory;
    let prev: LifeSnapshot | null = null;
    const told: string[] = [];
    for (const next of scans) {
      const out = deriveLifeSignals(prev, next, memory);
      told.push(...kinds(out));
      memory = out.memory;
      prev = next;
    }
    return told;
  };

  it('says "works on my machine" for the failing session when another in the same repo passed within 30 minutes', () => {
    const pass = test(NOW - 2000, true);
    const run = (ok: boolean | null, over: { repo?: string } = {}, at = NOW) =>
      scan(at, ['a', { recent: [pass] }], ['b', { ...over, recent: [test(NOW - 1000, ok)] }]);
    expect(walk([run(null), run(false, {}, NOW + 4000)])).toContain('tests.machine');
    expect(walk([run(null), run(true, {}, NOW + 4000)])).not.toContain('tests.machine');
    expect(
      walk([run(null, { repo: 'other' }), run(false, { repo: 'other' }, NOW + 4000)]),
    ).not.toContain('tests.machine');
    const staleScan = (ok: boolean | null, at: number) =>
      scan(at, ['a', { recent: [pass] }], ['b', { recent: [test(at - 1000, ok)] }]);
    expect(
      walk([staleScan(null, NOW + 31 * MIN), staleScan(false, NOW + 31 * MIN + 4000)]),
    ).not.toContain('tests.machine');
  });

  it('puts the sticker on the failing member whichever session finishes second', () => {
    const second = (ok: boolean) => {
      const before = scan(
        NOW,
        ['a', { recent: [test(NOW - 2000, false)] }],
        ['b', { recent: [test(NOW - 1000, null)] }],
      );
      const after = scan(
        NOW + 4000,
        ['a', { recent: [test(NOW - 2000, false)] }],
        ['b', { recent: [test(NOW - 1000, ok)] }],
      );
      const first = deriveLifeSignals(
        null,
        scan(NOW - 3000, ['a', { recent: [test(NOW - 2000, false)] }], ['b']),
      );
      return deriveLifeSignals(before, after, first.memory).signals.filter(
        (s) => s.kind === 'tests.machine',
      );
    };
    expect(second(true).map((s) => s.member)).toEqual(['local:a']);
    expect(second(false)).toEqual([]);
  });

  it('says "not a bug, a feature" only for fail, then an edit to a test file, then a pass within 20 minutes', () => {
    const edit = (at: number, target: string): Call => ({ tool: 'Edit', target, at });
    const sequence = (target: string, passAt: number, gap: number) => {
      const failed = test(NOW + 1000, false);
      const edited = edit(NOW + 40_000, target);
      const calls = [
        [test(NOW + 1000, null)],
        [failed],
        [failed, edited],
        [failed, edited, test(NOW + passAt, null)],
        [failed, edited, test(NOW + passAt, true)],
      ];
      return walk(calls.map((recent, i) => scan(NOW + i * gap, ['a', { recent }])));
    };
    expect(sequence('app.test.ts', 100_000, 30_000)).toContain('tests.edited');
    expect(sequence('app.spec.tsx', 100_000, 30_000)).toContain('tests.edited');
    expect(sequence('app.ts', 100_000, 30_000)).not.toContain('tests.edited');
    expect(sequence('app.test.ts', 21 * MIN, 5 * MIN)).not.toContain('tests.edited');
  });
});
