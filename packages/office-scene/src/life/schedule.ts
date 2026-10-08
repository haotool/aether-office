import { hashText } from '../environment/hash.js';
import { seeded } from '../environment/seeded.js';
import type { Quality } from '../scene/scene-types.js';
import { LIFE_RULES, type LifeRule } from './registry.js';
import { TIER, type LifeContext, type LifePrefs, type LifeSignal } from './signals.js';

/** One effect on show: what started it, where, and for how long. */
export type LifeCue = {
  key: string;
  rule: LifeRule['id'];
  category: LifeRule['category'];
  member: string | null;
  floor: number | null;
  startedAt: number;
  durationMs: number;
  /** Drives every seeded choice of the effect (side, variant, jitter), so the same cue always looks the same. */
  seed: number;
  /** The signal's count; for an outcome without one, 1 when it succeeded and 0 when it did not. */
  value: number;
  /** For a group effect: the members it stands over. */
  group: readonly string[];
  aria: string;
  /** A contact sheet frame: hold the effect at this many ms and never expire. */
  frozenT?: number;
};

export type LifeState = {
  live: readonly LifeCue[];
  /** Signals already handled, by key, with when: so a snapshot that repeats one never replays it. */
  seen: Readonly<Record<string, number>>;
  /** When each rule last started, per its cooldown scope. */
  last: Readonly<Record<string, number>>;
  /** How many eligible triggers each (member, rule) has had: the `n` of the seeded draw. */
  eligible: Readonly<Record<string, number>>;
  /** When the arbitrated cues of the last minute started. */
  starts: readonly number[];
};
export const emptyLifeState: LifeState = { live: [], seen: {}, last: {}, eligible: {}, starts: [] };

export type ScheduleEnv = {
  quality: Quality;
  reducedMotion: boolean;
  /** The rules to read; the registry's own unless a test brings others. */
  rules?: readonly LifeRule[];
};

/** A signal older than this when first seen is history, not news: a page load never replays it as a burst. */
export const STALE_MS = 30_000;
const SEEN_MS = 60_000;
/** The arbiter: at most one effect per member, two per floor, and three starts in any minute in the whole building. */
export const PER_FLOOR = 2;
export const PER_MINUTE = 3;
const WINDOW_MS = 60_000;
/** Out of view, an effect fires at half chance, so effects land where people look. */
const OFF_SCREEN = 0.5;
/** `rare` frequency halves the meme and social categories. */
const RARE = 0.5;

/** Is the rule allowed to show at all under these settings, this tier and this motion preference? */
export function ruleEnabled(rule: LifeRule, prefs: LifePrefs, env: ScheduleEnv): boolean {
  if (TIER[env.quality] < TIER[rule.minTier]) return false;
  if (env.reducedMotion && rule.reduced === 'none') return false;
  if (rule.category === 'relation') return prefs.relation;
  return !prefs.calm && prefs.categories[rule.category];
}

const signalKey = (s: LifeSignal) => `${s.kind}|${s.member ?? ''}|${s.at}`;

const chanceOf = (rule: LifeRule, prefs: LifePrefs, ctx: LifeContext, member: string | null) => {
  const rare =
    prefs.frequency === 'rare' && (rule.category === 'meme' || rule.category === 'social')
      ? RARE
      : 1;
  const seen = member === null || ctx.visible(member) ? 1 : OFF_SCREEN;
  return rule.chance * rare * seen;
};

/** The cooldown's scope key: a rule per member, per floor, or in the whole building. */
const cooldownKey = (rule: LifeRule, member: string | null, floor: number | null) =>
  rule.scope === 'member'
    ? `${rule.id}:${member}`
    : rule.scope === 'floor'
      ? `${rule.id}:f${floor}`
      : rule.id;

/** The cue a rule starts for a signal: where, for how long, its seed and value, who is in a group effect, and what is announced. */
function cueOf(
  rule: LifeRule,
  signal: LifeSignal,
  { floor, n, now }: { floor: number | null; n: number; now: number },
  ctx: LifeContext,
): LifeCue {
  const member = signal.member;
  return {
    key: `${rule.id}:${member}:${signal.at}`,
    rule: rule.id,
    category: rule.category,
    member,
    floor,
    startedAt: now,
    durationMs: rule.durationMs,
    seed: hashText(`${rule.id}:${member}:${n}`),
    value: signal.value ?? (signal.ok ? 1 : 0),
    group: rule.anchor === 'group' && floor !== null ? ctx.idleOn(floor).slice(0, 8) : [],
    aria: rule.aria(member === null ? '' : ctx.nameOf(member), ctx.zh, signal),
  };
}

type ScheduleScratch = {
  live: LifeCue[];
  starts: number[];
  seen: Record<string, number>;
  last: Record<string, number>;
  eligible: Record<string, number>;
  started: LifeCue[];
};

function tryStartRule(
  signal: LifeSignal,
  rule: LifeRule,
  now: number,
  prefs: LifePrefs,
  ctx: LifeContext,
  env: ScheduleEnv,
  scratch: ScheduleScratch,
): void {
  if (!ruleEnabled(rule, prefs, env) || !rule.when(signal, ctx)) return;
  if (rule.claimsOutcome && (signal.ok === null || signal.ok === undefined)) return;
  const member = signal.member;
  const floor = member === null ? null : ctx.floorOf(member);
  if (!rule.direct && floor === null) return;
  const key = cooldownKey(rule, member, floor);
  if (now - (scratch.last[key] ?? Number.NEGATIVE_INFINITY) < rule.cooldownMs) return;
  const draw = `${member}:${rule.id}`;
  const n = scratch.eligible[draw] ?? 0;
  scratch.eligible[draw] = n + 1;
  if (seeded(`${draw}:${n}`)() >= chanceOf(rule, prefs, ctx, member)) return;
  const bound = !rule.direct && rule.category !== 'relation';
  if (bound && !admitted(scratch.live, scratch.starts, member, floor)) return;
  const cue = cueOf(rule, signal, { floor, n, now }, ctx);
  scratch.live = [...scratch.live, cue];
  if (bound) scratch.starts = [...scratch.starts, now];
  scratch.last[key] = now;
  scratch.started.push(cue);
}

function applySignal(
  signal: LifeSignal,
  now: number,
  prefs: LifePrefs,
  ctx: LifeContext,
  env: ScheduleEnv,
  rules: readonly LifeRule[],
  scratch: ScheduleScratch,
): void {
  const id = signalKey(signal);
  if (scratch.seen[id] !== undefined) return;
  scratch.seen[id] = now;
  if (now - signal.at > STALE_MS) return;
  for (const rule of rules) tryStartRule(signal, rule, now, prefs, ctx, env, scratch);
}

/**
 * Takes the signals the page saw and decides which effects start now. Pure: the same state, signals, time, settings and
 * office always give the same cues. A cue is held back by its settings and tier, by the honesty rule (an effect that
 * claims a result needs a real one), by its cooldown, by its seeded chance, and by the arbiter.
 */
export function schedule(
  prev: LifeState,
  signals: readonly LifeSignal[],
  now: number,
  prefs: LifePrefs,
  ctx: LifeContext,
  env: ScheduleEnv,
): { state: LifeState; started: readonly LifeCue[] } {
  const rules = env.rules ?? LIFE_RULES;
  const scratch: ScheduleScratch = {
    live: prev.live.filter((c) => now < c.startedAt + c.durationMs),
    starts: prev.starts.filter((t) => now - t < WINDOW_MS),
    seen: Object.fromEntries(Object.entries(prev.seen).filter(([, at]) => now - at < SEEN_MS)),
    last: { ...prev.last },
    eligible: { ...prev.eligible },
    started: [],
  };
  const ordered = [...signals].sort(
    (a, b) => a.at - b.at || signalKey(a).localeCompare(signalKey(b)),
  );
  for (const signal of ordered) applySignal(signal, now, prefs, ctx, env, rules, scratch);
  return {
    state: {
      live: scratch.live,
      seen: scratch.seen,
      last: scratch.last,
      eligible: scratch.eligible,
      starts: scratch.starts,
    },
    started: scratch.started,
  };
}

/** One effect per member, two per floor, three starts a minute in all. Relation and viewer-made cues never come here. */
function admitted(
  live: readonly LifeCue[],
  starts: readonly number[],
  member: string | null,
  floor: number | null,
): boolean {
  const memes = live.filter((c) => c.category !== 'relation');
  return (
    starts.length < PER_MINUTE &&
    !memes.some((c) => c.member === member) &&
    memes.filter((c) => c.floor === floor).length < PER_FLOOR
  );
}

/**
 * The cues of a contact sheet frame (`?preview=life&effect=a,b:0&t=1500`): each named effect held at `t` ms on a member,
 * if its settings, tier and motion preference let it show, with none of the cooldowns, chances or arbiter. A group effect
 * stands over that one member.
 */
export function previewCues(
  effects: readonly string[],
  t: number,
  members: readonly string[],
  prefs: LifePrefs,
  ctx: LifeContext,
  env: ScheduleEnv,
): LifeCue[] {
  const rules = env.rules ?? LIFE_RULES;
  return effects.flatMap((spec, i) => {
    // `ci-stack:0` brings its own value (the CI stack: 1 green, 0 red); the rest take a mid-sized one.
    const [id = '', own] = spec.split(':');
    const rule = rules.find((r) => r.id === id);
    const member = members[i % Math.max(1, members.length)] ?? null;
    if (!rule || !member || !ruleEnabled(rule, prefs, env)) return [];
    const floor = ctx.floorOf(member);
    const value = own === undefined ? 40 : Number(own) || 0;
    return [
      {
        key: `preview:${id}`,
        rule: rule.id,
        category: rule.category,
        member,
        floor,
        startedAt: 0,
        durationMs: rule.durationMs,
        seed: hashText(id),
        value,
        group: rule.anchor === 'group' && member ? [member] : [],
        aria: rule.aria(ctx.nameOf(member), ctx.zh, {
          kind: 'tool.end',
          member,
          at: 0,
          ok: value > 0,
          value,
        }),
        frozenT: Math.min(t, rule.durationMs),
      },
    ];
  });
}
