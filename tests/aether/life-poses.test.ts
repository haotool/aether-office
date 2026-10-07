import { describe, expect, it } from 'vitest';
import { poseCalls } from '../../packages/office-scene/src/life/poses.js';
import { LIFE_RULES, ruleOf } from '../../packages/office-scene/src/life/registry.js';
import { EACH_DESK_MAX } from '../../packages/office-scene/src/life/place.js';
import type { LifeCue } from '../../packages/office-scene/src/life/schedule.js';

const cue = (rule: string, extra: Partial<LifeCue> = {}): LifeCue => ({
  key: rule,
  rule: rule as LifeCue['rule'],
  category: 'test',
  member: 'a',
  floor: 0,
  startedAt: 0,
  durationMs: 1000,
  seed: 1,
  value: 1,
  group: [],
  aria: '',
  ...extra,
});
const calls = (id: string, extra: Partial<LifeCue> = {}, view: string[] = []) =>
  poseCalls(ruleOf(id)!, cue(id, extra), view);

describe('the poses of the life effects', () => {
  it('asks a nod on a green test and a shrug on a red test, a failed build and a Friday deploy', () => {
    expect(calls('ci-pass')[0]?.request).toMatchObject({
      member: 'a',
      source: 'life',
      clip: 'nod',
    });
    for (const id of ['ci-fail', 'build-error', 'friday-deploy'])
      expect(calls(id)[0]?.request).toMatchObject({ clip: 'shrug' });
  });

  it('turns the member toward the duck, on the right of the desk', () => {
    const [call] = calls('rubber-duck');
    expect(call?.request.turn?.yaw).toBeLessThan(0);
    expect(call?.request.turn?.holdMs).toBeGreaterThan(0);
  });

  it('has each member of the stand-up circle stretch', () => {
    const asked = calls('standup', { member: 'a', group: ['a', 'b', 'c'] });
    expect(asked.map((c) => c.request.member)).toEqual(['a', 'b', 'c']);
    expect(asked.every((c) => c.request.clip === 'stretch')).toBe(true);
  });

  it('has the desks in view celebrate the Konami code, as many as the confetti dresses', () => {
    const many = Array.from({ length: 40 }, (_, i) => `m${i}`);
    const asked = calls('konami', { member: null }, many);
    expect(asked).toHaveLength(EACH_DESK_MAX);
    expect(asked[0]?.request).toMatchObject({ clip: 'celebrate', source: 'life' });
  });

  it('asks nothing of an effect without a pose, or of a desk effect with no member', () => {
    expect(calls('ci-lamp')).toEqual([]);
    expect(calls('ci-pass', { member: null })).toEqual([]);
  });

  it('only ever asks for a gesture the models have, after the effect started and while it lasts', () => {
    for (const rule of LIFE_RULES) {
      if (!rule.pose) continue;
      expect(rule.pose.atMs).toBeGreaterThan(0);
      const holds = 'holdMs' in rule.pose ? rule.pose.holdMs : 0;
      expect(rule.pose.atMs + holds).toBeLessThanOrEqual(rule.durationMs);
    }
  });
});
