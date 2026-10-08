import type { CSSProperties } from 'react';
import type { UsageTotals } from '@aether/contracts';
import { useT, useLocale } from '../../ui/useT.js';
import {
  breakdown,
  compact,
  sparkPoints,
  tokensOf,
  toneOf,
  type Locale,
  type Segment,
} from './kpi-model.js';
import type { Key } from '../../lib/i18n/i18n.js';

// Small charts drawn as plain SVG and CSS: no chart library, no per-frame work. Every value is also text.

const SEGMENT_WORD: Record<Segment, Key> = {
  input: 'kpiInput',
  output: 'kpiOutput',
  cacheRead: 'kpiCacheRead',
  cacheWrite: 'kpiCacheWrite',
  reasoning: 'kpiReasoning',
};

/** A line of values over time, filled beneath; decorative (the number beside it says the same). */
export function Sparkline({
  values,
  className = '',
}: {
  values: readonly number[];
  className?: string;
}) {
  const width = 80;
  const height = 22;
  const points = sparkPoints(values, width, height);
  return (
    <svg
      className={`spark ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {points && (
        <>
          <polygon points={`0,${height} ${points} ${width},${height}`} className="spark-area" />
          <polyline points={points} className="spark-line" />
        </>
      )}
    </svg>
  );
}

/** The token breakdown as one bar split by kind, with a legend that carries the numbers. */
export function StackedBar({ totals }: { totals: UsageTotals }) {
  const t = useT();
  const locale = useLocale();
  const parts = breakdown(totals);
  if (!parts.length) return <p className="kpi-empty">{t('kpiNoTokens')}</p>;
  return (
    <div className="stacked">
      <div className="stacked-bar" aria-hidden="true">
        {parts.map((p) => (
          <i key={p.key} className={`seg seg-${p.key}`} style={{ flexGrow: p.value }} />
        ))}
      </div>
      <ul className="stacked-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <i className={`seg seg-${p.key}`} aria-hidden="true" />
            <span>{t(SEGMENT_WORD[p.key])}</span>
            <b>{compact(p.value, locale)}</b>
            <small>{Math.round(p.share * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

const dayLabel = (day: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    Date.parse(`${day}T00:00:00Z`),
  );

/** One bar per day; a tooltip (hover or focus) names the day and its tokens. The last bar is today. */
export function DailyBars({
  days,
  totals,
}: {
  days: readonly string[];
  totals: readonly UsageTotals[];
}) {
  const t = useT();
  const locale = useLocale();
  const values = totals.map(tokensOf);
  const peak = Math.max(...values, 1);
  return (
    <ol className="daily-bars" aria-label={t('kpiDaily')}>
      {days.map((day, i) => {
        const text = `${dayLabel(day, locale)}: ${compact(values[i] ?? 0, locale)}`;
        return (
          <li
            key={day}
            tabIndex={0}
            data-tip={text}
            aria-label={text}
            className={i === days.length - 1 ? 'today' : ''}
          >
            <i style={{ height: `${Math.max(2, ((values[i] ?? 0) / peak) * 100)}%` }} />
          </li>
        );
      })}
    </ol>
  );
}

/** A rate-limit window as a ring: how much is used, the tone by how near the limit, the reset beside it as text. */
export function Ring({ percent, children }: { percent: number; children?: React.ReactNode }) {
  const shown = Math.min(100, Math.max(0, percent));
  return (
    <div
      className={`ring ring-${toneOf(percent)}`}
      style={{ ['--used' as string]: shown } as CSSProperties}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ring-track" cx="18" cy="18" r="15.9155" pathLength="100" />
        <circle
          className="ring-fill"
          cx="18"
          cy="18"
          r="15.9155"
          pathLength="100"
          strokeDasharray={`${shown} 100`}
        />
      </svg>
      <b>{Math.round(percent)}%</b>
      {children}
    </div>
  );
}

/** A name, a bar for its share and the figure: the by-model and by-project rows. */
export function ShareRow({
  label,
  value,
  share,
  note,
}: {
  label: string;
  value: string;
  share: number;
  note?: string | undefined;
}) {
  return (
    <li className="share-row" style={{ ['--share' as string]: share } as CSSProperties}>
      <span className="share-label" title={label}>
        {label}
      </span>
      <b>{value}</b>
      {note && <small>{note}</small>}
      <u aria-hidden="true" />
    </li>
  );
}
