import { describe, expect, it } from 'vitest';
import type { CommandTag } from '../../packages/contracts/src/index.js';
import { LIFE_RULES } from '../../packages/office-scene/src/life/registry.js';
import { seeded } from '../../packages/office-scene/src/environment/seeded.js';
import { weighted } from '../../packages/office-scene/src/environment/pick.js';
import {
  emptyLifeState,
  PER_FLOOR,
  PER_MINUTE,
  schedule,
  type LifeCue,
  type LifeState,
} from '../../packages/office-scene/src/life/schedule.js';
import {
  DEFAULT_LIFE_PREFS,
  type LifePrefs,
  type LifeSignal,
} from '../../packages/office-scene/src/life/signals.js';
import { env, floorOf, MEMBERS, office } from './life-fixtures.js';

const TICK_MS = 2_000;
const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;

const CALLS = {
  'git status': 30,
  'pnpm test': 10,
  'git diff': 20,
  'git push': 3,
  'pnpm install': 3,
  vim: 1,
  'pnpm build': 12,
  ls: 17,
};

const DANGER: readonly (readonly [CommandTag, number])[] = [
  ['git.push.force', 0.00003],
  ['deploy', 0.0001],
  ['fs.rm.recursive', 0.00005],
  ['sudo', 0.0002],
  ['curl.pipe', 0.00003],
  ['git.conflict.marker', 0.00003],
];

const end = (member: string, at: number, tag: CommandTag, ok: boolean): LifeSignal => ({
  kind: 'tool.end',
  member,
  at,
  tool: 'Bash',
  tags: [tag],
  ok,
});

function simulate(hours: number, prefs: LifePrefs, seed = 'day') {
  const random = seeded(seed);
  let state: LifeState = emptyLifeState;
  const cues: LifeCue[] = [];
  const ctx = office();
  for (let now = T0; now < T0 + hours * HOUR; now += TICK_MS) {
    const signals: LifeSignal[] = [];
    for (const member of MEMBERS) {
      if (random() < 0.05)
        signals.push({
          kind: 'tool.start',
          member,
          at: now,
          tool: 'Bash',
          target: weighted(random, CALLS),
        });
      if (random() < 0.002)
        signals.push({ ...end(member, now, 'test', random() < 0.6), target: 'pnpm test' });
      if (random() < 0.0008) signals.push(end(member, now, 'build', random() < 0.5));
      if (random() < 0.00015) signals.push(end(member, now, 'ci.watch', random() < 0.7));
      if (random() < 0.0006) signals.push(end(member, now, 'git.push', random() < 0.9));
      if (random() < 0.00005) signals.push(end(member, now, 'gh.pr.approve', true));
      for (const [tag, chance] of DANGER)
        if (random() < chance)
          signals.push({ kind: 'tool.start', member, at: now, tool: 'Bash', tags: [tag] });
      if (random() < 0.0001) signals.push({ kind: 'git.conflicts', member, at: now, value: 2 });
      if (random() < 0.00005) signals.push({ kind: 'tests.machine', member, at: now, ok: false });
      if (random() < 0.00005) signals.push({ kind: 'tests.edited', member, at: now, ok: true });
      if (random() < 0.0008) signals.push({ kind: 'think.long', member, at: now });
      if (random() < 0.0004) signals.push({ kind: 'work.long', member, at: now });
      if (random() < 0.0006)
        signals.push({
          kind: 'retry.loop',
          member,
          at: now,
          tool: 'Bash',
          target: 'pnpm test',
          value: 4,
        });
      if (random() < 0.0006) signals.push({ kind: 'idle.long', member, at: now });
      if (random() < 0.0003) signals.push({ kind: 'debt.sustained', member, at: now, value: 30 });
      if (random() < 0.0002) signals.push({ kind: 'activity.error', member, at: now });
    }
    if (random() < 0.0001) signals.push({ kind: 'ui.konami', member: null, at: now });
    const run = schedule(state, signals, now, prefs, ctx, env);
    state = run.state;
    cues.push(...run.started);
  }
  return cues;
}

describe('a simulated day does not feel spammy', () => {
  const day = simulate(8, DEFAULT_LIFE_PREFS);
  const memes = day.filter((c) => c.category !== 'relation' && c.member !== null);

  it('is deterministic: the same day gives the same cues', () => {
    expect(simulate(8, DEFAULT_LIFE_PREFS)).toEqual(day);
  });

  it(`never starts more than ${PER_MINUTE} effects in any minute, and never overlaps two on a member or ${PER_FLOOR + 1} on a floor`, () => {
    const starts = memes.map((c) => c.startedAt).sort((a, b) => a - b);
    for (let i = 0; i + PER_MINUTE < starts.length; i += 1)
      expect(starts[i + PER_MINUTE]! - starts[i]!).toBeGreaterThanOrEqual(60_000);
    for (const c of memes) {
      const together = memes.filter(
        (o) => o.startedAt <= c.startedAt && c.startedAt < o.startedAt + o.durationMs,
      );
      expect(together.filter((o) => o.member === c.member)).toHaveLength(1);
      expect(together.filter((o) => o.floor === c.floor).length).toBeLessThanOrEqual(PER_FLOOR);
    }
  });

  it('shows few effects: under one and a half a minute for the whole building, a dozen an hour at most for a member', () => {
    const perHour = memes.length / 8;
    expect(perHour).toBeGreaterThan(5);
    expect(perHour).toBeLessThanOrEqual(90);
    for (const member of MEMBERS)
      expect(memes.filter((c) => c.member === member).length / 8).toBeLessThanOrEqual(12);
  });

  it('shows a variety, not one effect over and over', () => {
    const kinds = new Map<string, number>();
    for (const c of memes) kinds.set(c.rule, (kinds.get(c.rule) ?? 0) + 1);
    expect(kinds.size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...kinds.values()) / memes.length).toBeLessThan(0.5);
  });

  it('shows the wave 2 outcome and danger rows too, a few an hour, none of them the busiest', () => {
    const rows = [
      'R10',
      'R11',
      'R12',
      'R13',
      'R17',
      'R18',
      'R19',
      'R22',
      'R23',
      'R25',
      'R46',
      'R47',
      'R48',
      'R59',
      'R60',
    ];
    const wave2 = new Set(LIFE_RULES.filter((r) => rows.includes(r.row)).map((r) => r.id));
    const shown = memes.filter((c) => wave2.has(c.rule));
    expect(new Set(shown.map((c) => c.rule)).size).toBeGreaterThanOrEqual(5);
    expect(shown.length / 8).toBeLessThanOrEqual(45);
  });

  it('repeats an effect on one member no faster than the shortest cooldown, five minutes', () => {
    const last = new Map<string, number>();
    for (const c of day) {
      const key = `${c.rule}:${c.member}`;
      const before = last.get(key);
      if (before !== undefined) expect(c.startedAt - before).toBeGreaterThanOrEqual(5 * 60_000);
      last.set(key, c.startedAt);
    }
  });

  it('shows nothing at all in Calm mode', () => {
    expect(simulate(8, { ...DEFAULT_LIFE_PREFS, calm: true })).toEqual([]);
  });

  it('shows fewer at rare frequency than at normal, never more', () => {
    const rare = simulate(8, { ...DEFAULT_LIFE_PREFS, frequency: 'rare' });
    const normal = simulate(8, { ...DEFAULT_LIFE_PREFS, frequency: 'normal' });
    expect(rare.length).toBeLessThanOrEqual(normal.length);
    expect(floorOf('m5')).toBe(1);
  });
});
