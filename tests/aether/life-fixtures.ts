import type {
  LifeContext,
  LifePrefs,
  LifeSignal,
} from '../../packages/office-scene/src/life/signals.js';
import { DEFAULT_LIFE_PREFS } from '../../packages/office-scene/src/life/signals.js';
import type { ScheduleEnv } from '../../packages/office-scene/src/life/schedule.js';

/** A small office for the life tests: members `m1`..`m8`, four to a floor, all in view, a few idle. */
export const MEMBERS = Array.from({ length: 8 }, (_, i) => `m${i + 1}`);
export const floorOf = (member: string) => Math.floor((Number(member.slice(1)) - 1) / 4);

export const office = (over: Partial<LifeContext> = {}): LifeContext => ({
  floorOf: (m) => (MEMBERS.includes(m) ? floorOf(m) : null),
  visible: (m) => MEMBERS.includes(m),
  idleOn: (floor) => MEMBERS.filter((m) => floorOf(m) === floor),
  nameOf: (m) => m.toUpperCase(),
  zh: false,
  ...over,
});

/** Every kind on and a chance that never gets in the way: for tests of the rules around the draw. */
export const loud: LifePrefs = { ...DEFAULT_LIFE_PREFS, frequency: 'normal' };
export const env: ScheduleEnv = { quality: 'high', reducedMotion: false };

export const push = (member: string, at: number, target = 'git push'): LifeSignal => ({
  kind: 'tool.start',
  member,
  at,
  tool: 'Bash',
  target,
});
