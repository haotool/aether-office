import { describe, expect, it } from 'vitest';
import type { AttributedSession } from '../../packages/contracts/src/index.js';
import {
  emptyOutcomes,
  outcomeSignals,
  type OutcomeMemory,
} from '../../apps/web/src/features/office/life-outcomes.js';
import { SUBAGENT_INFIX, parentOf } from '../../apps/web/src/lib/sessions/subagent-id.js';
import { isOperator } from '../../apps/web/src/lib/navigation/roles.js';

const MIN = 60_000;
const NOW = 10_000_000;
type Call = {
  tool: string;
  target: string | null;
  at: number;
  ok: boolean | null;
  tags: string[];
  agentId?: string;
};
const session = (...recent: Call[]) => ({ hook: { recent } }) as unknown as AttributedSession;
const test = (at: number, ok: boolean | null): Call => ({
  tool: 'Bash',
  target: 'pnpm test',
  at,
  ok,
  tags: ['test'],
});
const edit = (at: number, target = 'src/a.test.ts', tool = 'Edit'): Call => ({
  tool,
  target,
  at,
  ok: true,
  tags: [],
});
const scan = (
  over: Partial<Parameters<typeof outcomeSignals>[0]> & { next: AttributedSession },
): ReturnType<typeof outcomeSignals> =>
  outcomeSignals({
    member: 'ann',
    repo: '/repo',
    old: session(),
    at: NOW,
    seenUntil: 0,
    memory: emptyOutcomes,
    ...over,
  });
const kinds = (r: ReturnType<typeof outcomeSignals>) => r.signals.map((s) => s.kind);

describe('outcomeSignals: single calls', () => {
  it('gives a tool.end for a call whose outcome has just become known', () => {
    const result = scan({
      next: session({ tool: 'Read', target: 'a.ts', at: NOW - 1000, ok: true, tags: ['read'] }),
    });
    expect(result.signals).toEqual([
      {
        kind: 'tool.end',
        member: 'ann',
        at: NOW,
        tool: 'Read',
        target: 'a.ts',
        ok: true,
        tags: ['read'],
      },
    ]);
  });

  it('says nothing for a call whose outcome is not known, or was already known at the last scan', () => {
    const pending = session({ tool: 'Bash', target: 'x', at: NOW - 1000, ok: null, tags: [] });
    expect(scan({ next: pending }).signals).toEqual([]);
    const done = session({ tool: 'Bash', target: 'x', at: NOW - 1000, ok: false, tags: [] });
    expect(scan({ old: done, next: done }).signals).toEqual([]);
    expect(kinds(scan({ old: pending, next: done }))).toEqual(['tool.end']);
  });

  it('ignores a subagent’s calls, which belong to its own member', () => {
    const sub = { tool: 'Bash', target: 'x', at: NOW - 1000, ok: true, tags: [], agentId: 'sub-1' };
    expect(scan({ next: session(sub) }).signals).toEqual([]);
  });

  it('on a session first seen at page load counts only a fresh call, not old news', () => {
    const old = session({ tool: 'Bash', target: 'x', at: NOW - 5 * MIN, ok: true, tags: [] });
    const fresh = session({ tool: 'Bash', target: 'x', at: NOW - 5_000, ok: true, tags: [] });
    expect(scan({ old: undefined, next: old }).signals).toEqual([]);
    expect(kinds(scan({ old: undefined, next: fresh }))).toEqual(['tool.end']);
  });

  it('leaves out the tags when the call had none', () => {
    const [signal] = scan({
      next: session({ tool: 'Bash', target: null, at: NOW - 1, ok: true, tags: [] }),
    }).signals;
    expect(signal).not.toHaveProperty('tags');
  });
});

describe('outcomeSignals: the same tests on two machines', () => {
  const other: OutcomeMemory = {
    tests: [{ member: 'bob', repo: '/repo', ok: true, at: NOW - 5 * MIN }],
    fixing: {},
  };

  it('blames the member whose run failed while another member’s run of the same repo passed', () => {
    const result = scan({ next: session(test(NOW - 1000, false)), memory: other });
    expect(result.signals).toContainEqual({
      kind: 'tests.machine',
      member: 'ann',
      at: NOW,
      ok: false,
    });
  });

  it('blames the other member when this one passes and the other one failed', () => {
    const memory: OutcomeMemory = {
      tests: [{ member: 'bob', repo: '/repo', ok: false, at: NOW - 5 * MIN }],
      fixing: {},
    };
    const result = scan({ next: session(test(NOW - 1000, true)), memory });
    expect(result.signals).toContainEqual({
      kind: 'tests.machine',
      member: 'bob',
      at: NOW,
      ok: false,
    });
  });

  it('does not compare different repositories, equal outcomes or runs older than half an hour', () => {
    const next = session(test(NOW - 1000, false));
    expect(
      kinds(
        scan({
          next,
          memory: {
            tests: [{ member: 'bob', repo: '/else', ok: true, at: NOW - MIN }],
            fixing: {},
          },
        }),
      ),
    ).toEqual(['tool.end']);
    expect(
      kinds(
        scan({
          next,
          memory: {
            tests: [{ member: 'bob', repo: '/repo', ok: false, at: NOW - MIN }],
            fixing: {},
          },
        }),
      ),
    ).toEqual(['tool.end']);
    expect(
      kinds(
        scan({
          next,
          memory: {
            tests: [{ member: 'bob', repo: '/repo', ok: true, at: NOW - 31 * MIN }],
            fixing: {},
          },
        }),
      ),
    ).toEqual(['tool.end']);
  });

  it('remembers only the member’s latest run and forgets old ones', () => {
    const memory: OutcomeMemory = {
      tests: [
        { member: 'ann', repo: '/repo', ok: true, at: NOW - 10 * MIN },
        { member: 'old', repo: '/repo', ok: true, at: NOW - 45 * MIN },
      ],
      fixing: {},
    };
    const result = scan({ next: session(test(NOW - 1000, true)), memory });
    expect(result.memory.tests).toEqual([
      { member: 'ann', repo: '/repo', ok: true, at: NOW - 1000 },
    ]);
  });
});

describe('outcomeSignals: a fix that passes', () => {
  const failing = (): OutcomeMemory => ({
    tests: [],
    fixing: { ann: { failAt: NOW - 10 * MIN, editedAt: null } },
  });

  it('notes a failed run, then an edit to a test file, then a pass, as "not a bug, a feature"', () => {
    const failed = scan({
      next: session(test(NOW - 10 * MIN, false)),
      at: NOW - 10 * MIN + 1000,
      seenUntil: 0,
    });
    expect(failed.memory.fixing['ann']).toEqual({ failAt: NOW - 10 * MIN, editedAt: null });
    const edited = scan({
      old: session(test(NOW - 10 * MIN, false)),
      next: session(test(NOW - 10 * MIN, false), edit(NOW - 5 * MIN)),
      memory: failed.memory,
      at: NOW - 4 * MIN,
      seenUntil: NOW - 10 * MIN,
    });
    expect(edited.memory.fixing['ann']!.editedAt).toBe(NOW - 5 * MIN);
    const passed = scan({
      old: session(test(NOW - 10 * MIN, false), edit(NOW - 5 * MIN)),
      next: session(test(NOW - 10 * MIN, false), edit(NOW - 5 * MIN), test(NOW - 1000, true)),
      memory: edited.memory,
      seenUntil: NOW - 5 * MIN,
    });
    expect(passed.signals).toContainEqual({
      kind: 'tests.edited',
      member: 'ann',
      at: NOW,
      ok: true,
    });
    expect(passed.memory.fixing).toEqual({});
  });

  it('needs the edit to be to a test file and made by an editing tool', () => {
    const source = scan({
      next: session(edit(NOW - 1000, 'src/a.ts')),
      memory: failing(),
      old: session(),
    });
    expect(source.memory.fixing['ann']!.editedAt).toBeNull();
    const reading = scan({
      next: session(edit(NOW - 1000, 'src/a.test.ts', 'Read')),
      memory: failing(),
    });
    expect(reading.memory.fixing['ann']!.editedAt).toBeNull();
    const spec = scan({
      next: session(edit(NOW - 1000, 'src/a.spec.ts', 'MultiEdit')),
      memory: failing(),
    });
    expect(spec.memory.fixing['ann']!.editedAt).toBe(NOW - 1000);
  });

  it('says nothing when the pass comes without an edit in between, or too late', () => {
    expect(kinds(scan({ next: session(test(NOW - 1000, true)), memory: failing() }))).toEqual([
      'tool.end',
    ]);
    const slow: OutcomeMemory = {
      tests: [],
      fixing: { ann: { failAt: NOW - 25 * MIN, editedAt: NOW - 20 * MIN } },
    };
    expect(kinds(scan({ next: session(test(NOW - 1000, true)), memory: slow }))).toEqual([
      'tool.end',
    ]);
  });

  it('stops waiting for a fix after twenty minutes', () => {
    const stale: OutcomeMemory = {
      tests: [],
      fixing: { ann: { failAt: NOW - 21 * MIN, editedAt: null } },
    };
    expect(scan({ next: session(), memory: stale }).memory.fixing).toEqual({});
  });

  it('puts events in the order they happened, whatever order the scan lists them in', () => {
    const memory: OutcomeMemory = {
      tests: [],
      fixing: { ann: { failAt: NOW - 10 * MIN, editedAt: null } },
    };
    const result = scan({
      old: session(test(NOW - 10 * MIN, false)),
      next: session(test(NOW - 10 * MIN, false), test(NOW - 1000, true), edit(NOW - 5 * MIN)),
      memory,
      seenUntil: NOW - 6 * MIN,
    });
    expect(result.signals).toContainEqual({
      kind: 'tests.edited',
      member: 'ann',
      at: NOW,
      ok: true,
    });
  });
});

describe('small shared helpers', () => {
  it('parentOf gives a subagent’s supervisor and a supervisor itself', () => {
    expect(parentOf(`local:claude:abc${SUBAGENT_INFIX}s1`)).toBe('local:claude:abc');
    expect(parentOf('local:claude:abc')).toBe('local:claude:abc');
  });

  it('only owners and operators may change things', () => {
    expect(isOperator('owner')).toBe(true);
    expect(isOperator('operator')).toBe(true);
    for (const role of ['viewer', 'reviewer', 'agent', '', undefined])
      expect(isOperator(role)).toBe(false);
  });
});
