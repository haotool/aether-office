import type { UsageResponse } from '@aether/contracts';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { when } from './ClaudeQuota.js';
import { Ring } from './kpi-charts.js';
import { limitWindows, resetsIn, windowName } from './kpi-model.js';

/**
 * Claude's and Codex's rate-limit windows as rings: percent used, the reset as a countdown and a clock time. Account-wide,
 * not per office. A provider with no reading says so rather than showing a figure it does not have.
 */
export function KpiLimits({ limits, now }: { limits: UsageResponse['limits']; now: number }) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
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
            return (
              <li key={w.id}>
                <Ring percent={w.usedPercent} />
                <span className="ring-text">
                  <b>
                    {w.provider === 'claude' ? 'Claude' : 'Codex'} ·{' '}
                    {'key' in name ? t(name.key) : name.text}
                  </b>
                  <small>
                    {left ? `${t('kpiResetsIn')} ${left}` : t('kpiResetUnknown')}
                    {w.resetsAt ? ` · ${when(w.resetsAt)}` : ''}
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
