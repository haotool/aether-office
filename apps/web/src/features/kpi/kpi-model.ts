import type {
  AttributedSession,
  GitKpiResponse,
  UsageResponse,
  UsageScope,
  UsageTotals,
} from '@aether/contracts';
import type { FloorKpiBadge } from '@aether/office-scene/model';
import { formatSpan } from '@aether/kernel';
import { WARN_AT } from './quota.js';

export type Locale = 'zh-TW' | 'en';
export type Range = UsageResponse['range'];
export const RANGES: readonly Range[] = ['today', '7d', '30d'];

const SEGMENTS = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const tokensOf = (t: UsageTotals) => t.input + t.output + t.cacheWrite + t.reasoning;

export const bytes = (n: number | null) =>
  n === null
    ? '—'
    : n >= 1e9
      ? `${(n / 1e9).toFixed(1)} GB`
      : n >= 1e6
        ? `${(n / 1e6).toFixed(0)} MB`
        : `${Math.round(n / 1e3)} KB`;

export function compact(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: n >= 1000 ? 1 : 0,
  }).format(n);
}

export function breakdown(totals: UsageTotals): { key: Segment; value: number; share: number }[] {
  const sum = SEGMENTS.reduce((n, key) => n + totals[key], 0);
  return SEGMENTS.map((key) => ({
    key,
    value: totals[key],
    share: sum ? totals[key] / sum : 0,
  })).filter((part) => part.value > 0);
}

export const lastDay = (scope: UsageScope): UsageTotals => {
  const day = scope.daily.at(-1);
  if (!day) throw new Error('usage scope has no daily rows');
  return day;
};

export function modelShares(scope: UsageScope): { model: string; tokens: number; share: number }[] {
  const sum = tokensOf(scope.totals) || scope.models.reduce((n, m) => n + m.tokens, 0);
  return scope.models.map((m) => ({ ...m, share: sum ? m.tokens / sum : 0 }));
}

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
  minutes: number | null;
  usedPercent: number;
  resetsAt: number | null;
  updatedAt: number;
  /** Claude's own flag (its source says it is not being refreshed); Codex's is worked out from the age. */
  stale: boolean | null;
};

export const LIMIT_STALE_MS = 15 * 60 * 1000;

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
  const codex = limits.codex;
  if (codex)
    for (const w of codex.windows ?? [])
      out.push({
        id: `codex-${w.minutes ?? 'x'}`,
        provider: 'codex',
        ...w,
        updatedAt: codex.updatedAt,
        stale: null,
      });
  return out;
}

export function windowName(
  minutes: number | null,
): { key: 'fiveHourWindow' | 'sevenDayWindow' } | { text: string } {
  if (minutes === 300) return { key: 'fiveHourWindow' };
  if (minutes === 10080) return { key: 'sevenDayWindow' };
  if (minutes === null) return { text: '—' };
  return { text: minutes % 1440 === 0 ? `${minutes / 1440}d` : `${Math.round(minutes / 60)}h` };
}

type Tone = 'ok' | 'warn' | 'hot';
export const toneOf = (percent: number): Tone =>
  percent >= 100 ? 'hot' : percent >= WARN_AT ? 'warn' : 'ok';

export const resetsIn = (resetsAt: number | null, now: number, locale: Locale) =>
  resetsAt !== null && resetsAt > now ? formatSpan(resetsAt - now, locale) : null;

export const runningSessions = (sessions: readonly Pick<AttributedSession, 'process'>[]) =>
  sessions.filter((s) => s.process === 'running').length;

type BadgeWords = { tokens: string; merged: string };

/** Empty while usage is unknown, so the building shows no number it does not have. */
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
