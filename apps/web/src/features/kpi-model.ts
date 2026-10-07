import type {
  AttributedSession,
  GitKpiResponse,
  UsageResponse,
  UsageScope,
  UsageTotals,
} from '@aether/contracts';
import type { FloorKpiBadge } from '@aether/office-scene/model';
import { formatSpan } from '../localSessions.js';
import { WARN_AT } from './quota.js';

// The numbers behind the KPI strip, the floor cards and the dashboard. Pure: formatting, shares, windows and paths.

export type Locale = 'zh-TW' | 'en';
export type Range = UsageResponse['range'];
export const RANGES: readonly Range[] = ['today', '7d', '30d'];

/** The segments of the token breakdown, in the order they are drawn. */
const SEGMENTS = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Tokens the headline counts: everything but cache reads, which dominate every session and are not spend. */
export const tokensOf = (t: UsageTotals) => t.input + t.output + t.cacheWrite + t.reasoning;

/** 1234 → 1.2K, 1_500_000 → 1.5M (`Intl` compact notation, in the page's language). */
export function compact(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: n >= 1000 ? 1 : 0,
  }).format(n);
}

/** The five parts of a scope's tokens with their share of the whole (cache reads included), zero parts left out. */
export function breakdown(totals: UsageTotals): { key: Segment; value: number; share: number }[] {
  const sum = SEGMENTS.reduce((n, key) => n + totals[key], 0);
  return SEGMENTS.map((key) => ({
    key,
    value: totals[key],
    share: sum ? totals[key] / sum : 0,
  })).filter((part) => part.value > 0);
}

/** Today is the last day of the window. */
export const lastDay = (scope: UsageScope): UsageTotals => scope.daily[scope.daily.length - 1]!;

/** The share of each model in the scope's tokens (its total, not just the models listed), largest first. */
export function modelShares(scope: UsageScope): { model: string; tokens: number; share: number }[] {
  const sum = tokensOf(scope.totals) || scope.models.reduce((n, m) => n + m.tokens, 0);
  return scope.models.map((m) => ({ ...m, share: sum ? m.tokens / sum : 0 }));
}

/** Pure. A polyline's points for a sparkline in a `width` by `height` box, the largest value touching the top. */
export function sparkPoints(values: readonly number[], width: number, height: number): string {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');
}

type LimitWindow = {
  id: string;
  provider: 'claude' | 'codex';
  /** Window length in minutes; null when the file did not say. */
  minutes: number | null;
  usedPercent: number;
  resetsAt: number | null;
  /** When the reading was taken (epoch ms). */
  updatedAt: number;
  /** Claude's own flag (its source says it is not being refreshed); Codex's is worked out from the age. */
  stale: boolean | null;
};

/** A rate-limit reading older than this is shown as out of date (the same threshold the Claude reader uses). */
export const LIMIT_STALE_MS = 15 * 60 * 1000;

/** Pure. Claude's 5-hour and 7-day windows and Codex's windows, those that are known, shortest first per provider. */
export function limitWindows(limits: UsageResponse['limits']): LimitWindow[] {
  const claude = limits.claude;
  const out: LimitWindow[] = [];
  if (claude?.fiveHour)
    out.push({
      id: 'claude-5h',
      provider: 'claude',
      minutes: 300,
      ...claude.fiveHour,
      updatedAt: claude.updatedAt,
      stale: claude.stale,
    });
  if (claude?.sevenDay)
    out.push({
      id: 'claude-7d',
      provider: 'claude',
      minutes: 10080,
      ...claude.sevenDay,
      updatedAt: claude.updatedAt,
      stale: claude.stale,
    });
  for (const w of limits.codex?.windows ?? [])
    out.push({
      id: `codex-${w.minutes ?? 'x'}`,
      provider: 'codex',
      ...w,
      updatedAt: limits.codex!.updatedAt,
      stale: null,
    });
  return out;
}

/** A window's name: the two usual lengths by name, any other as hours or days. */
export function windowName(
  minutes: number | null,
): { key: 'fiveHourWindow' | 'sevenDayWindow' } | { text: string } {
  if (minutes === 300) return { key: 'fiveHourWindow' };
  if (minutes === 10080) return { key: 'sevenDayWindow' };
  if (minutes === null) return { text: '—' };
  return { text: minutes % 1440 === 0 ? `${minutes / 1440}d` : `${Math.round(minutes / 60)}h` };
}

type Tone = 'ok' | 'warn' | 'hot';
/** Near the limit (the top bar's threshold) is a warning; at it, hot. */
export const toneOf = (percent: number): Tone =>
  percent >= 100 ? 'hot' : percent >= WARN_AT ? 'warn' : 'ok';

/** How long until a reset ("2 h", "35 min"); null when unknown or already past. */
export const resetsIn = (resetsAt: number | null, now: number, locale: Locale) =>
  resetsAt !== null && resetsAt > now ? formatSpan(resetsAt - now, locale) : null;

/** Sessions with a process running now. */
export const runningSessions = (sessions: readonly Pick<AttributedSession, 'process'>[]) =>
  sessions.filter((s) => s.process === 'running').length;

type BadgeWords = { tokens: string; merged: string };

/**
 * Pure. The badge of each floor: its tokens today, its share of the busiest floor, the rate (tokens per active minute)
 * and the branches merged in the week. Empty while usage is unknown, so the building shows no number it does not have.
 */
export function floorBadges(
  usage: UsageResponse | undefined,
  git: GitKpiResponse | undefined,
  locale: Locale,
  words: BadgeWords,
): (FloorKpiBadge | null)[] {
  if (!usage?.enabled) return [];
  const today = usage.offices.map((o) => ({ floor: o.floor, day: lastDay(o.scope) }));
  const busiest = Math.max(...today.map((o) => tokensOf(o.day)), 1);
  const out: (FloorKpiBadge | null)[] = [];
  for (const { floor, day } of today) {
    const tokens = tokensOf(day);
    const merged = git?.offices.find((o) => o.floor === floor)?.kpi?.mergedBranches.d7;
    out[floor] = {
      tokens: compact(tokens, locale),
      share: tokens / busiest,
      rate: day.activeMinutes > 0 ? `${compact(tokens / day.activeMinutes, locale)}/min` : null,
      merged: merged === undefined ? null : String(merged),
      labels: words,
    };
  }
  return out;
}
