import type { CommandTag } from '@aether/contracts';
import type { Quality } from '../scene/scene-types.js';

/** The scene never parses a session, and nothing here claims an outcome. */
export type SignalKind =
  | 'tool.start'
  | 'tool.end' // a call's real outcome became known: `ok` is true or false here, never null
  | 'git.conflicts'
  | 'tests.machine'
  | 'tests.edited'
  | 'think.long'
  | 'work.long'
  | 'retry.loop'
  | 'debt.sustained'
  | 'idle.long'
  | 'activity.error'
  | 'ui.konami';

export type LifeSignal = {
  kind: SignalKind;
  member: string | null;
  at: number;
  tool?: string | null;
  target?: string | null;
  tags?: readonly CommandTag[];
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
  calm: boolean;
  relation: boolean;
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

export type LifeContext = {
  floorOf: (member: string) => number | null;
  visible: (member: string) => boolean;
  idleOn: (floor: number) => readonly string[];
  nameOf: (member: string) => string;
  zh: boolean;
};

export const TIER: Readonly<Record<Quality, number>> = { low: 0, balanced: 1, high: 2 };

export type LifeMoment = { member: string; rule: string; text: string; at: number };

export type LifeInput = {
  signals: readonly LifeSignal[];
  prefs: LifePrefs;
  names: Readonly<Record<string, string>>;
  idle: readonly string[];
  preview?: { effects: readonly string[]; t: number; members: readonly string[]; loop?: true };
  onMoment?: (moment: LifeMoment) => void;
};
