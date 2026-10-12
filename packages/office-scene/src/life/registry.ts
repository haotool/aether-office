import type { ClipName } from '../animals/animal-states.js';
import type { Quality } from '../scene/scene-types.js';
import type { EffectId } from './effects/index.js';
import { isInstall, isQaSite, isTestRun, isVim, pushed } from './matchers.js';
import { COMMAND_OUTCOME_RULES } from './registry-command-outcomes.js';
import type { LifeCategory, LifeContext, LifeSignal } from './signals.js';
import { sceneText } from '../i18n/scene-text.js';

type LifePose = { clip: ClipName; atMs: number } | { turn: number; holdMs: number; atMs: number };

/**
 * The registry is the source; docs/design/office-life.md section 5.3 lists the same rows and a test keeps the two in
 * step. Every effect is decorative: how anything ended is said only when the rule is marked `claimsOutcome` and the
 * provider stated it.
 */
export type LifeRule = {
  id: EffectId;
  row: string;
  category: LifeCategory;
  decorative: true;
  claimsOutcome: boolean;
  when: (signal: LifeSignal, ctx: LifeContext) => boolean;
  durationMs: number;
  cooldownMs: number;
  scope: 'member' | 'floor' | 'building';
  chance: number;
  minTier: Quality;
  reduced: 'static' | 'none';
  anchor: 'desk' | 'group' | 'each-desk';
  direct?: boolean;
  pose?: LifePose;
  aria: (who: string, zh: boolean, signal: LifeSignal) => string;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const WAVE_1_RULES: readonly LifeRule[] = [
  {
    id: 'rubber-duck',
    row: 'R8',
    category: 'wellbeing',
    decorative: true,
    claimsOutcome: false,
    when: (s) => s.kind === 'think.long',
    durationMs: 18_000,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    pose: { turn: -0.45, holdMs: 7000, atMs: 1200 },
    aria: (who, zh) => sceneText(zh, 'life.rubberDuck', { who }),
  },
  {
    id: 'ci-lamp',
    row: 'R9',
    category: 'test',
    decorative: true,
    claimsOutcome: false,
    when: isTestRun,
    durationMs: 14_000,
    cooldownMs: 5 * MINUTE,
    scope: 'member',
    chance: 0.5,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => sceneText(zh, 'life.tests', { who }),
  },
  {
    id: 'install-hole',
    row: 'R14',
    category: 'test',
    decorative: true,
    claimsOutcome: false,
    when: isInstall,
    durationMs: 20_000,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.7,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => sceneText(zh, 'life.install', { who }),
  },
  {
    id: 'ship-it',
    row: 'R17',
    category: 'git',
    decorative: true,
    claimsOutcome: true,
    when: pushed,
    durationMs: 2_600,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.9,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => sceneText(zh, 'life.push', { who }),
  },
  {
    id: 'pager',
    row: 'R27',
    category: 'ops',
    decorative: true,
    claimsOutcome: false,
    when: (s) => s.kind === 'activity.error',
    durationMs: 3_000,
    cooldownMs: 5 * MINUTE,
    scope: 'member',
    chance: 0.9,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => sceneText(zh, 'life.error', { who }),
  },
  {
    id: 'coffee-refill',
    row: 'R32',
    category: 'wellbeing',
    decorative: true,
    claimsOutcome: false,
    when: (s) => s.kind === 'work.long',
    durationMs: 4_500,
    cooldownMs: 45 * MINUTE,
    scope: 'member',
    chance: 0.5,
    minTier: 'balanced',
    reduced: 'none',
    anchor: 'desk',
    aria: (who, zh) => sceneText(zh, 'life.coffee', { who }),
  },
  {
    id: 'retry-loop',
    row: 'R36',
    category: 'meme',
    decorative: true,
    claimsOutcome: false,
    when: (s) => s.kind === 'retry.loop',
    durationMs: 8_000,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh, s) => sceneText(zh, 'life.repeat', { who, n: s.value ?? 4 }),
  },
  {
    id: 'ctrl-cv',
    row: 'R38',
    category: 'meme',
    decorative: true,
    claimsOutcome: false,
    when: isQaSite,
    durationMs: 2_400,
    cooldownMs: 30 * MINUTE,
    scope: 'member',
    chance: 0.7,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => sceneText(zh, 'life.stackOverflow', { who }),
  },
  {
    id: 'vim-trap',
    row: 'R41',
    category: 'meme',
    decorative: true,
    claimsOutcome: false,
    when: isVim,
    durationMs: 4_000,
    cooldownMs: DAY,
    scope: 'member',
    chance: 0.5,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => sceneText(zh, 'life.vim', { who }),
  },
  {
    id: 'tech-debt',
    row: 'R44',
    category: 'work',
    decorative: true,
    claimsOutcome: false,
    when: (s) => s.kind === 'debt.sustained',
    durationMs: 45_000,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 1,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh, s) => sceneText(zh, 'life.uncommitted', { who, n: s.value ?? 20 }),
  },
  {
    id: 'standup',
    row: 'R53',
    category: 'social',
    decorative: true,
    claimsOutcome: false,
    when: (s, ctx) => {
      if (s.kind !== 'idle.long' || !s.member) return false;
      const floor = ctx.floorOf(s.member);
      return floor !== null && ctx.idleOn(floor).length >= 3;
    },
    durationMs: 12_000,
    cooldownMs: 60 * MINUTE,
    scope: 'floor',
    chance: 0.8,
    minTier: 'balanced',
    reduced: 'none',
    anchor: 'group',
    pose: { clip: 'stretch', atMs: 1500 },
    aria: (_who, zh) => sceneText(zh, 'life.idle'),
  },
  {
    id: 'konami',
    row: 'R56',
    category: 'easter',
    decorative: true,
    claimsOutcome: false,
    when: (s) => s.kind === 'ui.konami',
    durationMs: 4_500,
    cooldownMs: DAY,
    scope: 'building',
    chance: 1,
    minTier: 'balanced',
    reduced: 'none',
    anchor: 'each-desk',
    direct: true,
    pose: { clip: 'celebrate', atMs: 400 },
    aria: (_who, zh) => sceneText(zh, 'life.konami'),
  },
];

export const LIFE_RULES: readonly LifeRule[] = [...WAVE_1_RULES, ...COMMAND_OUTCOME_RULES];

export const ruleOf = (id: string): LifeRule | undefined => LIFE_RULES.find((r) => r.id === id);
