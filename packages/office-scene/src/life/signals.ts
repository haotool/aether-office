import type { CommandTag } from '@aether/contracts';
import type { Quality } from '../scene/scene-types.js';

/**
 * What the office-life layer reads: small facts about what the sessions did, derived on the web side from real data
 * (apps/web/src/features/office/life-signals.ts). The scene never parses a session, and nothing here claims an outcome.
 */
export type SignalKind =
  | 'tool.start' // a tool call began: `tool`, the short redacted `target` the hook kept and the closed-vocabulary `tags`
  | 'tool.end' // a call's real outcome became known: `ok` is true or false here, never null
  | 'git.conflicts' // a repo went from no conflicted files to some; `value` is how many
  | 'tests.machine' // a test run failed in one session while another in the same repo passed within half an hour
  | 'tests.edited' // a test run failed, a test file was edited, and the tests then passed within 20 minutes
  | 'think.long' // the model has been silent between tools for a while
  | 'work.long' // working in a session that began hours ago
  | 'retry.loop' // the same command ran again and again in a short time; `value` is how many times
  | 'debt.sustained' // many uncommitted files for a long time; `value` is how many
  | 'idle.long' // idle for minutes
  | 'activity.error' // the member's state turned to error
  | 'ui.konami'; // the viewer typed the Konami code

export type LifeSignal = {
  kind: SignalKind;
  /** The member it is about; null for a building-wide signal made by the viewer. */
  member: string | null;
  /** When it happened (the source's time, not the render's). */
  at: number;
  tool?: string | null;
  target?: string | null;
  /** What kind of command it was (closed vocabulary from the hook receiver); never its arguments. */
  tags?: readonly CommandTag[];
  /** The real outcome when a provider states one; null or absent when it is not known. Effects that claim a result need it. */
  ok?: boolean | null;
  value?: number;
};

/** `relation` rows (squads) are never silenced by Calm mode; every other category can be switched off. */
export const LIFE_CATEGORIES = [
  'work',
  'git',
  'test',
  'ops',
  'wellbeing',
  'social',
  'meme',
  'easter',
] as const;
export type MemeCategory = (typeof LIFE_CATEGORIES)[number];
export type LifeCategory = MemeCategory | 'relation';

export type LifePrefs = {
  /** The master switch: every effect but the relation ones is off. On by default when the system asks for reduced motion. */
  calm: boolean;
  /** Relation effects (squad zone, beam, hand-over). */
  relation: boolean;
  /** `rare` halves the chance of the meme and social effects. */
  frequency: 'rare' | 'normal';
  categories: Readonly<Record<MemeCategory, boolean>>;
};

export const DEFAULT_LIFE_PREFS: LifePrefs = {
  calm: false,
  relation: true,
  frequency: 'rare',
  categories: {
    work: true,
    git: true,
    test: true,
    ops: true,
    wellbeing: true,
    social: true,
    meme: true,
    easter: true,
  },
};

/** What a rule's trigger and the arbiter need to know about the office right now. */
export type LifeContext = {
  /** The floor a member sits on; null when it has no seat (not in the scene). */
  floorOf: (member: string) => number | null;
  /** Is the member on a floor that is in view? Effects out of view fire at half chance. */
  visible: (member: string) => boolean;
  /** Members idle right now on a floor. */
  idleOn: (floor: number) => readonly string[];
  nameOf: (member: string) => string;
  zh: boolean;
};

/** What the scene draws a rule at: how far the quality tier reaches. */
export const TIER: Readonly<Record<Quality, number>> = { low: 0, balanced: 1, high: 2 };

/** One moment that was shown (and said in the aria log): for the page's "recent moments" list of a member. Decorative. */
export type LifeMoment = { member: string; rule: string; text: string; at: number };

/** What the page hands the scene: the signals seen so far, the person's settings, and a preview when one is asked for. */
export type LifeInput = {
  signals: readonly LifeSignal[];
  prefs: LifePrefs;
  /** The display name of each member, for the aria text. */
  names: Readonly<Record<string, string>>;
  /** Members idle right now. */
  idle: readonly string[];
  /** `?preview=life&effect=a+b&t=1500`: draw these effects frozen at `t` ms on these members (`loop`: played on from there, over and over), scheduler and cooldowns aside. */
  preview?: { effects: readonly string[]; t: number; members: readonly string[]; loop?: true };
  /** Called once for each effect that starts for a member (a preview frame included), with the words the log says. */
  onMoment?: (moment: LifeMoment) => void;
};
