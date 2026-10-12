import { describe, expect, it } from 'vitest';
import {
  emptyLifeState,
  PER_FLOOR,
  PER_MINUTE,
  previewCues,
  ruleEnabled,
  schedule,
  STALE_MS,
} from '../../packages/office-scene/src/life/schedule.js';
import {
  LIFE_RULES,
  ruleOf,
  type LifeRule,
} from '../../packages/office-scene/src/life/registry.js';
import {
  DEFAULT_LIFE_PREFS,
  type LifeSignal,
} from '../../packages/office-scene/src/life/signals.js';
import { env, floorOf, loud, MEMBERS, office, push } from './life-fixtures.js';

const NOW = 1_000_000_000;
// A plain "a push command started" rule to test the scheduler around: the real `ship-it` waits for an outcome.
const ship: LifeRule = {
  ...ruleOf('ship-it')!,
  claimsOutcome: false,
  when: (s) => s.kind === 'tool.start' && s.target === 'git push',
  aria: (who, zh) => (zh ? `${who} 開始了 git push` : `${who} started a git push`),
};
const certain = (over: Partial<LifeRule> = {}): LifeRule => ({ ...ship, chance: 1, ...over });
const run = (
  signals: readonly LifeSignal[],
  now = NOW,
  rules: readonly LifeRule[] = [certain()],
  state = emptyLifeState,
  prefs = loud,
  e = env,
) => schedule(state, signals, now, prefs, office(), { ...e, rules });

describe('schedule: what starts', () => {
  it('starts an effect for a matching signal, with the aria text in the right language', () => {
    const { started } = run([push('m1', NOW - 1000)]);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ rule: 'ship-it', member: 'm1', floor: 0, startedAt: NOW });
    expect(started[0]!.aria).toBe('M1 started a git push');
    const zh = schedule(emptyLifeState, [push('m1', NOW)], NOW, loud, office({ zh: true }), {
      ...env,
      rules: [certain()],
    });
    expect(zh.started[0]!.aria).toBe('M1 開始了 git push');
  });

  it('ignores a signal that does not match, a member that is not in the scene and news older than 30 s', () => {
    expect(run([push('m1', NOW, 'git status')]).started).toHaveLength(0);
    expect(run([push('ghost', NOW)]).started).toHaveLength(0);
    expect(run([push('m1', NOW - STALE_MS - 1)]).started).toHaveLength(0);
    expect(run([push('m1', NOW - STALE_MS)]).started).toHaveLength(1);
  });

  it('never handles the same signal twice, as a snapshot that repeats it would make it', () => {
    const first = run([push('m1', NOW)]);
    const again = run([push('m1', NOW)], NOW + 2000, [certain({ cooldownMs: 0 })], first.state);
    expect(again.started).toHaveLength(0);
  });

  it('is deterministic: the same inputs give the same cues, and the draw is seeded', () => {
    const rules = LIFE_RULES;
    const signals = MEMBERS.flatMap((m, i): LifeSignal[] => [
      push(m, NOW - i * 100),
      {
        kind: 'tool.end',
        member: m,
        at: NOW - i * 100,
        tool: 'Bash',
        tags: ['test'],
        ok: i % 2 === 0,
      },
    ]);
    const a = schedule(emptyLifeState, signals, NOW, loud, office(), { ...env, rules });
    const b = schedule(emptyLifeState, [...signals].reverse(), NOW, loud, office(), {
      ...env,
      rules,
    });
    expect(a.started.length).toBeGreaterThan(0);
    expect(b.started).toEqual(a.started);
  });
});

describe('schedule: cooldowns', () => {
  it("holds a member back for the rule's cooldown, and lets it through after", () => {
    const rule = certain({ cooldownMs: 10 * 60_000 });
    const first = run([push('m1', NOW)], NOW, [rule]);
    const soon = run([push('m1', NOW + 60_000)], NOW + 60_000, [rule], first.state);
    expect(soon.started).toHaveLength(0);
    const later = run([push('m1', NOW + 601_000)], NOW + 601_000, [rule], first.state);
    expect(later.started).toHaveLength(1);
  });

  it('keeps a cooldown per member for member scope, and one for all in building scope', () => {
    const perMember = certain({ cooldownMs: 60_000, scope: 'member' });
    const a = run([push('m1', NOW)], NOW, [perMember]);
    expect(run([push('m2', NOW + 1000)], NOW + 1000, [perMember], a.state).started).toHaveLength(1);
    const building = certain({ cooldownMs: 60_000, scope: 'building' });
    const b = run([push('m1', NOW)], NOW, [building]);
    expect(run([push('m2', NOW + 1000)], NOW + 1000, [building], b.state).started).toHaveLength(0);
  });

  it('keeps one cooldown per floor for floor scope', () => {
    const rule = certain({ cooldownMs: 60_000, scope: 'floor' });
    const a = run([push('m1', NOW)], NOW, [rule]);
    expect(run([push('m2', NOW + 1000)], NOW + 1000, [rule], a.state).started).toHaveLength(0);
    expect(run([push('m5', NOW + 1000)], NOW + 1000, [rule], a.state).started).toHaveLength(1);
  });
});

describe('schedule: the arbiter', () => {
  const free = certain({ cooldownMs: 0 });

  it('allows one effect per member at a time', () => {
    const a = run([push('m1', NOW)], NOW, [free]);
    expect(run([push('m1', NOW + 1000)], NOW + 1000, [free], a.state).started).toHaveLength(0);
    const after = NOW + free.durationMs + 1;
    expect(run([push('m1', after)], after, [free], a.state).started).toHaveLength(1);
  });

  it(`allows ${PER_FLOOR} at a time per floor`, () => {
    const { started } = run(
      ['m1', 'm2', 'm3'].map((m) => push(m, NOW)),
      NOW,
      [free],
    );
    expect(started.map((c) => c.member)).toEqual(['m1', 'm2']);
    expect(started.every((c) => c.floor === floorOf('m1'))).toBe(true);
  });

  it(`allows ${PER_MINUTE} starts in any minute in the building, and the window slides`, () => {
    const spread = ['m1', 'm5', 'm2', 'm6'];
    const { started, state } = run(
      spread.map((m, i) => push(m, NOW + i)),
      NOW + 3,
      [free],
    );
    expect(started).toHaveLength(PER_MINUTE);
    const t = NOW + 61_000;
    expect(run([push('m6', t)], t, [free], state).started).toHaveLength(1);
  });

  it('never holds back a relation effect or one the viewer made', () => {
    const relation = certain({ cooldownMs: 0, category: 'relation' });
    const signals = MEMBERS.map((m) => push(m, NOW));
    expect(run(signals, NOW, [relation]).started).toHaveLength(MEMBERS.length);
    const konami = ruleOf('konami')!;
    const viewer: LifeSignal = { kind: 'ui.konami', member: null, at: NOW };
    const crowded = run(signals, NOW, [free]);
    expect(run([viewer], NOW, [konami], crowded.state).started).toHaveLength(1);
  });
});

describe('schedule: settings, tier and motion', () => {
  const off = (over: Partial<typeof loud>) => ({ ...loud, ...over });

  it('shows nothing in Calm mode, and nothing from a kind that is switched off', () => {
    expect(
      run([push('m1', NOW)], NOW, [certain()], emptyLifeState, off({ calm: true })).started,
    ).toHaveLength(0);
    const noGit = off({ categories: { ...loud.categories, git: false } });
    expect(run([push('m1', NOW)], NOW, [certain()], emptyLifeState, noGit).started).toHaveLength(0);
  });

  it('keeps relation effects in Calm mode, and drops them when their own switch is off', () => {
    const relation = certain({ category: 'relation' });
    expect(ruleEnabled(relation, off({ calm: true }), env)).toBe(true);
    expect(ruleEnabled(relation, off({ relation: false }), env)).toBe(false);
  });

  it('gates by quality tier and by reduced motion', () => {
    const balanced = certain({ minTier: 'balanced' });
    expect(ruleEnabled(balanced, loud, { quality: 'low', reducedMotion: false })).toBe(false);
    expect(ruleEnabled(balanced, loud, { quality: 'balanced', reducedMotion: false })).toBe(true);
    const high = certain({ minTier: 'high' });
    expect(ruleEnabled(high, loud, { quality: 'balanced', reducedMotion: false })).toBe(false);
    const still = certain({ reduced: 'static' });
    const none = certain({ reduced: 'none' });
    expect(ruleEnabled(still, loud, { quality: 'high', reducedMotion: true })).toBe(true);
    expect(ruleEnabled(none, loud, { quality: 'high', reducedMotion: true })).toBe(false);
    expect(
      run([push('m1', NOW)], NOW, [balanced], emptyLifeState, loud, {
        quality: 'low',
        reducedMotion: false,
      }).started,
    ).toHaveLength(0);
  });
});

describe('schedule: the honesty guard', () => {
  const claims = certain({ claimsOutcome: true });

  it('never starts an effect that claims a result without a real one', () => {
    expect(run([{ ...push('m1', NOW), ok: null }], NOW, [claims]).started).toHaveLength(0);
    expect(run([push('m1', NOW)], NOW, [claims]).started).toHaveLength(0);
  });

  it('starts it once the outcome is known', () => {
    expect(run([{ ...push('m1', NOW), ok: true }], NOW, [claims]).started).toHaveLength(1);
    expect(run([{ ...push('m1', NOW), ok: false }], NOW, [claims]).started).toHaveLength(1);
  });
});

describe('schedule: chance', () => {
  const draws = (prefs: typeof loud, category: LifeRule['category'], visible: boolean) => {
    const rule = certain({ chance: 0.5, cooldownMs: 0, category });
    let shown = 0;
    for (let i = 0; i < 400; i += 1) {
      const m = `m${(i % 8) + 1}`;
      const ctx = office({ visible: () => visible, floorOf: () => 0, nameOf: () => String(i) });
      const state = { ...emptyLifeState, eligible: { [`${m}:${rule.id}`]: i } };
      shown += schedule(state, [push(m, NOW + i)], NOW + i, prefs, ctx, { ...env, rules: [rule] })
        .started.length;
    }
    return shown;
  };

  it('halves the meme and social chance at rare frequency, and only those', () => {
    const rare = { ...DEFAULT_LIFE_PREFS, frequency: 'rare' as const };
    const normal = { ...DEFAULT_LIFE_PREFS, frequency: 'normal' as const };
    expect(draws(rare, 'meme', true) / draws(normal, 'meme', true)).toBeCloseTo(0.5, 0);
    expect(draws(rare, 'git', true)).toBe(draws(normal, 'git', true));
  });

  it('halves the chance for a member out of view', () => {
    expect(draws(loud, 'git', false) / draws(loud, 'git', true)).toBeCloseTo(0.5, 0);
  });
});

describe('schedule: group and preview', () => {
  const standup = ruleOf('standup')!;
  const idle: LifeSignal = { kind: 'idle.long', member: 'm1', at: NOW };

  it('starts the stand-up circle only when three or more are idle on the floor, and names them', () => {
    const rule = { ...standup, chance: 1 };
    const crowd = schedule(emptyLifeState, [idle], NOW, loud, office(), { ...env, rules: [rule] });
    expect(crowd.started[0]!.group).toEqual(['m1', 'm2', 'm3', 'm4']);
    const two = office({ idleOn: () => ['m1', 'm2'] });
    expect(
      schedule(emptyLifeState, [idle], NOW, loud, two, { ...env, rules: [rule] }).started,
    ).toHaveLength(0);
  });

  it("holds a preview cue at its time, capped at the effect's length, and respects the settings", () => {
    const [cue] = previewCues(['rubber-duck'], 1500, ['m1'], loud, office(), env);
    expect(cue).toMatchObject({ rule: 'rubber-duck', member: 'm1', frozenT: 1500, startedAt: 0 });
    expect(previewCues(['rubber-duck'], 99_999_999, ['m1'], loud, office(), env)[0]!.frozenT).toBe(
      18_000,
    );
    expect(previewCues(['rubber-duck'], 0, ['m1'], { ...loud, calm: true }, office(), env)).toEqual(
      [],
    );
    expect(previewCues(['nope'], 0, ['m1'], loud, office(), env)).toEqual([]);
  });
});
