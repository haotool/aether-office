import type { ClipName } from '../animals/animal-states.js';
import type { Quality } from '../scene/scene-types.js';
import type { EffectId } from './effects/index.js';
import { isInstall, isQaSite, isTestRun, isVim, pushed } from './matchers.js';
import { COMMAND_OUTCOME_RULES } from './registry-command-outcomes.js';
import type { LifeCategory, LifeContext, LifeSignal } from './signals.js';

/**
 * What a member does while the effect plays, asked of the pose registry (pose-cues.ts) `atMs` into it: a clip the model
 * already has, or a turn of the chair (radians; negative is toward the desk's right) held for a while. A gesture, not a
 * claim: it never says more than the effect does.
 */
type LifePose = { clip: ClipName; atMs: number } | { turn: number; holdMs: number; atMs: number };

/**
 * Every office-life effect that fires from the data the server already provides: when it fires, how rarely, and what a
 * screen reader hears. The registry is the source; docs/design/office-life.md section 5.3 lists the same rows (`row`),
 * and a test keeps the two in step. Every effect is decorative: it says what a command was started as or what state a
 * session is in, and how anything ended only when the rule is marked `claimsOutcome` and the provider stated it.
 */
export type LifeRule = {
  id: EffectId;
  /** The row of the spec's registry table this implements (R8, R9, ...). */
  row: string;
  category: LifeCategory;
  decorative: true;
  /**
   * The effect would claim a result (passed, failed, pushed). Such a rule needs a real `ok`: its matcher reads `ok === true`
   * or `ok === false`, and the scheduler drops its signal again when `ok` is null or missing.
   */
  claimsOutcome: boolean;
  /** Is this signal a trigger? Pure: it reads the signal and the office, nothing else. */
  when: (signal: LifeSignal, ctx: LifeContext) => boolean;
  durationMs: number;
  /** The same effect may not repeat within this long, per member, per floor or in the building. */
  cooldownMs: number;
  scope: 'member' | 'floor' | 'building';
  /** The share of eligible triggers that show (seeded, so a replay chooses the same way). */
  chance: number;
  /** The lowest quality tier that shows it. */
  minTier: Quality;
  /** With reduced motion: a still picture, or nothing. */
  reduced: 'static' | 'none';
  /** Where the effect is drawn: on the member's desk, over a group of idle members, or on every desk in view. */
  anchor: 'desk' | 'group' | 'each-desk';
  /** Caused by the viewer themselves (a key sequence): not held back by the arbiter. */
  direct?: boolean;
  /** The gesture of the member (or of each member the effect stands over) while it plays. */
  pose?: LifePose;
  /** What a screen reader hears; `who` is the member's name. */
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
    aria: (who, zh) =>
      zh ? `${who} 正在跟橡皮鴨一起想` : `${who} is thinking it through with the rubber duck`,
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
    aria: (who, zh) => (zh ? `${who} 正在跑測試` : `${who} is running tests`),
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
    aria: (who, zh) => (zh ? `${who} 正在安裝套件` : `${who} is installing dependencies`),
  },
  {
    id: 'ship-it',
    row: 'R17',
    category: 'git',
    decorative: true,
    claimsOutcome: true, // "pushed": the push command exited successfully (a force push has its own row, R18)
    when: pushed,
    durationMs: 2_600,
    cooldownMs: 10 * MINUTE,
    scope: 'member',
    chance: 0.9,
    minTier: 'balanced',
    reduced: 'static',
    anchor: 'desk',
    aria: (who, zh) => (zh ? `${who} 推送了程式碼` : `${who} pushed`),
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
    aria: (who, zh) => (zh ? `${who} 遇到錯誤` : `${who} hit an error`),
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
    aria: (who, zh) => (zh ? `${who} 續了一杯咖啡` : `${who} refilled the coffee`),
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
    aria: (who, zh, s) =>
      zh
        ? `${who} 在短時間內重複執行同一個指令 ${s.value ?? 4} 次`
        : `${who} ran the same command ${s.value ?? 4} times in a short while`,
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
    aria: (who, zh) =>
      zh ? `${who} 上 Stack Overflow 查了資料` : `${who} looked something up on Stack Overflow`,
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
    aria: (who, zh) => (zh ? `${who} 開了 vim` : `${who} opened vim`),
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
    aria: (who, zh, s) =>
      zh
        ? `${who} 有 ${s.value ?? 20} 個未提交的檔案`
        : `${who} has ${s.value ?? 20} uncommitted files`,
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
    aria: (_who, zh) => (zh ? '好幾個工作階段正在閒置' : 'Several sessions are idle'),
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
    aria: (_who, zh) => (zh ? 'Konami 密技！' : 'Konami code!'),
  },
];

/** Every rule, wave 1 (what the office already showed) then wave 2 (the outcome rows). The first rule an arbiter admits wins a shared call. */
export const LIFE_RULES: readonly LifeRule[] = [...WAVE_1_RULES, ...COMMAND_OUTCOME_RULES];

export const ruleOf = (id: string): LifeRule | undefined => LIFE_RULES.find((r) => r.id === id);
