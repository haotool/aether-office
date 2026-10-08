import type { UsageResponse } from '@aether/contracts';
import { useT, useLocale } from '../../ui/useT.js';
import { formatSpan } from '@aether/kernel';
import { when } from './ClaudeQuota.js';
import { Ring } from './kpi-charts.js';
import { LIMIT_STALE_MS, limitWindows, resetsIn, windowName } from './kpi-model.js';

type KpiLimitsProps = {
  limits: UsageResponse['limits'];
  now: number;
  timeZone: string;
};

/**
 * Claude's and Codex's rate-limit windows as rings: percent used, the reset as a countdown and a clock time. Account-wide,
 * not per office. A provider with no reading says so rather than showing a figure it does not have.
 */
export function KpiLimits({ limits, now, timeZone }: KpiLimitsProps) {
  const t = useT();
  const locale = useLocale();
  const windows = limitWindows(limits);
  const known = new Set(windows.map((w) => w.provider));
  return (
    <section className="kpi-section" aria-labelledby="kpi-limits">
      <h3 id="kpi-limits">{t('kpiLimits')}</h3>
      {windows.length === 0 ? (
        <p className="kpi-empty">{t('kpiLimitsNone')}</p>
      ) : (
        <ul className="kpi-rings">
          {windows.map((w) => {
            const name = windowName(w.minutes);
            const left = resetsIn(w.resetsAt, now, locale);
            const age = Math.max(0, now - w.updatedAt);
            const stale = w.stale ?? age > LIMIT_STALE_MS;
            return (
              <li key={w.id} className={stale ? 'stale' : undefined}>
                <Ring percent={w.usedPercent} />
                <span className="ring-text">
                  <b>
                    {w.provider === 'claude' ? 'Claude' : 'Codex'} ·{' '}
                    {'key' in name ? t(name.key) : name.text}
                  </b>
                  <small>
                    {left ? `${t('kpiResetsIn')} ${left}` : t('kpiResetUnknown')}
                    {w.resetsAt ? ` · ${when(w.resetsAt, timeZone)}` : ''}
                  </small>
                  <small>
                    {t('kpiReadAge')} {formatSpan(age, locale)}
                    {stale ? ` · ${t('kpiLimitStale')}` : ''}
                  </small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="kpi-note">
        {(['claude', 'codex'] as const)
          .filter((p) => !known.has(p))
          .map((p) => (p === 'claude' ? t('kpiClaudeLimitsNone') : t('kpiCodexLimitsNone')))
          .join(' ')}
        {limits.claude?.stale ? ` ${t('quotaStale')}` : ''}
      </p>
    </section>
  );
}
