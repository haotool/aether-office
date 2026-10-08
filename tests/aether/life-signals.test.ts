import { describe, expect, it } from 'vitest';
import {
  deriveLifeSignals,
  emptyLifeMemory,
  KONAMI,
  konamiStep,
  type LifeSnapshot,
} from '../../apps/web/src/features/office/life-signals.js';

import { NOW, session, snap, type Call } from './life-sessions.js';

const kinds = (r: { signals: { kind: string }[] }) => r.signals.map((s) => s.kind);
const patterns = (r: { signals: { kind: string }[] }) =>
  kinds(r).filter((k) => k !== 'tool.start' && k !== 'tool.end');

describe('deriveLifeSignals', () => {
  it('turns a call that is new since the last scan into a tool.start of that member, with the time of the call', () => {
    const before = snap(NOW, [
      session('a', { recent: [{ tool: 'Bash', target: 'pnpm test', at: NOW - 5000 }] }),
    ]);
    const after = snap(NOW + 4000, [
      session('a', {
        recent: [
          { tool: 'Bash', target: 'pnpm test', at: NOW - 5000 },
          { tool: 'Bash', target: 'git push', at: NOW + 2000 },
        ],
      }),
    ]);
    const { signals } = deriveLifeSignals(before, after);
    expect(signals).toEqual([
      { kind: 'tool.start', member: 'local:a', at: NOW + 2000, tool: 'Bash', target: 'git push' },
    ]);
  });

  it("ignores a subagent's calls (they belong to the helper) and replays nothing from before the first scan", () => {
    const calls: Call[] = [
      { tool: 'Bash', target: 'git push', at: NOW - 1000, agentId: 'sub' },
      { tool: 'Bash', target: 'vim', at: NOW - 60_000 },
      { tool: 'Bash', target: 'pnpm test', at: NOW - 3000 },
    ];
    const { signals } = deriveLifeSignals(null, snap(NOW, [session('a', { recent: calls })]));
    expect(signals.map((s) => s.target)).toEqual(['pnpm test']);
  });

  it('says a long silence began only when it crosses 45 s, not while it merely holds, and not on the first scan', () => {
    const quiet = (at: number, hookAt: number) => snap(at, [session('a', { hookAt })]);
    expect(kinds(deriveLifeSignals(null, quiet(NOW, NOW - 90_000)))).toEqual([]);
    expect(
      kinds(deriveLifeSignals(quiet(NOW, NOW - 40_000), quiet(NOW + 10_000, NOW - 40_000))),
    ).toEqual(['think.long']);
    expect(
      kinds(deriveLifeSignals(quiet(NOW, NOW - 60_000), quiet(NOW + 10_000, NOW - 60_000))),
    ).toEqual([]);
    const running = snap(NOW + 10_000, [session('a', { hookAt: NOW - 60_000, tool: 'Bash' })]);
    expect(kinds(deriveLifeSignals(quiet(NOW, NOW - 40_000), running))).toEqual([]); // a tool is running: not thinking
  });

  it('says a session has worked for hours when it crosses two hours of work', () => {
    const at = (t: number, startedAt: number) => snap(t, [session('a', { startedAt })]);
    const hours = 2 * 3_600_000;
    expect(
      kinds(deriveLifeSignals(at(NOW, NOW - hours + 5000), at(NOW + 10_000, NOW - hours + 5000))),
    ).toEqual(['work.long']);
    expect(
      kinds(deriveLifeSignals(at(NOW, NOW - 3_600_000), at(NOW + 10_000, NOW - 3_600_000))),
    ).toEqual([]);
  });

  it('spots the same command repeated 4 times in 2 minutes, once, with how many times', () => {
    const run = (n: number): Call[] =>
      Array.from({ length: n }, (_, i) => ({
        tool: 'Bash',
        target: 'pnpm test',
        at: NOW - 100_000 + i * 20_000,
      }));
    const three = snap(NOW, [session('a', { recent: run(3) })]);
    const four = snap(NOW + 20_000, [session('a', { recent: run(4) })]);
    const out = deriveLifeSignals(three, four);
    expect(out.signals.find((s) => s.kind === 'retry.loop')).toMatchObject({
      value: 4,
      target: 'pnpm test',
      member: 'local:a',
    });
    expect(
      kinds(
        deriveLifeSignals(four, snap(NOW + 22_000, [session('a', { recent: run(4) })])),
      ).includes('retry.loop'),
    ).toBe(false);
    const spread = [0, 1, 2, 3].map((i): Call => ({
      tool: 'Bash',
      target: 'ls',
      at: NOW - i * 200_000,
    }));
    expect(
      patterns(deriveLifeSignals(three, snap(NOW, [session('a', { recent: spread })]))),
    ).toEqual([]);
  });

  it('says tech debt only after 30 minutes of 20 or more uncommitted files, and again at most every 15 minutes', () => {
    let memory = emptyLifeMemory;
    let prev: LifeSnapshot | null = null;
    const fired: number[] = [];
    for (let minute = 0; minute <= 80; minute += 1) {
      const at = NOW + minute * 60_000;
      const next = snap(at, [session('a', { uncommitted: minute < 70 ? 25 : 3 })]);
      const out = deriveLifeSignals(prev, next, memory);
      if (kinds(out).includes('debt.sustained')) fired.push(minute);
      memory = out.memory;
      prev = next;
    }
    expect(fired).toEqual([30, 45, 60]);
    expect(memory.dirtySince).toEqual({});
    expect(memory.debtAt).toEqual({});
  });

  it('says a session has been idle for minutes when it crosses 5 minutes, and a member turned to error', () => {
    const idle = (at: number, quietMs: number) =>
      snap(at, [session('a', { state: 'idle', quietMs, activity: 'idle' })]);
    expect(kinds(deriveLifeSignals(idle(NOW, 290_000), idle(NOW + 20_000, 310_000)))).toEqual([
      'idle.long',
    ]);
    expect(kinds(deriveLifeSignals(idle(NOW, 400_000), idle(NOW + 20_000, 420_000)))).toEqual([]);
    const agent = (activity: string) => [{ id: 'x1', activity }];
    expect(
      kinds(
        deriveLifeSignals(snap(NOW, [], agent('working')), snap(NOW + 4000, [], agent('error'))),
      ),
    ).toEqual(['activity.error']);
    expect(
      kinds(deriveLifeSignals(snap(NOW, [], agent('error')), snap(NOW + 4000, [], agent('error')))),
    ).toEqual([]);
    expect(kinds(deriveLifeSignals(null, snap(NOW, [], agent('error'))))).toEqual([]);
  });
});

describe('konamiStep', () => {
  const type = (keys: string[]) => keys.reduce((progress, key) => konamiStep(progress, key), 0);

  it('completes on the whole code, with either case for the letters', () => {
    expect(type([...KONAMI])).toBe(KONAMI.length);
    expect(type([...KONAMI.slice(0, 8), 'B', 'A'])).toBe(KONAMI.length);
  });

  it('starts over on a wrong key, but a wrong first key may itself start the code', () => {
    expect(type(['ArrowUp', 'ArrowUp', 'x'])).toBe(0);
    expect(type(['ArrowUp', 'ArrowUp', 'ArrowUp'])).toBe(1);
    expect(type(['ArrowDown', 'b'])).toBe(0);
  });
});
