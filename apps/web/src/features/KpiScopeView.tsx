import type { AttributedSession, GitKpiResponse, UsageResponse } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { CountUp } from './CountUp.js';
import { DailyBars, ShareRow, StackedBar } from './kpi-charts.js';
import { KpiGit } from './KpiGit.js';
import { KpiLimits } from './KpiLimits.js';
import { compact, modelShares, tokensOf, type Range } from './kpi-model.js';

const hours = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
const SHOWN_DAYS = { today: 7, '7d': 7, '30d': 30 } as const;

function Headline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kpi-tile">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One scope of the dashboard: the whole building (`office` null) or one office. Tokens by kind, by day, by model, the
 * heaviest sessions, the rate-limit windows and the repositories' Git activity, every figure with the numbers beside it.
 */
export function KpiScopeView({
  usage,
  git,
  gitLoading,
  office,
  range,
  sessions,
  now,
}: {
  usage: UsageResponse;
  git: GitKpiResponse | undefined;
  gitLoading: boolean;
  office: number | null;
  range: Range;
  sessions: readonly AttributedSession[];
  now: number;
}) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const department = office === null ? null : DEPARTMENTS[office]!;
  const scope =
    office === null
      ? usage.building
      : (usage.offices.find((o) => o.floor === office)?.scope ?? usage.building);
  const kpi = office === null ? git?.building : git?.offices.find((o) => o.floor === office)?.kpi;
  const totals = scope.totals;
  const shown = SHOWN_DAYS[range];
  const days = usage.days.slice(-shown);
  const top = usage.sessions.filter((s) => department === null || s.department === department.id);
  const titles = new Map(sessions.map((s) => [s.key, s.title]));
  const empty = tokensOf(totals) === 0 && totals.cacheRead === 0;
  return (
    <div className="kpi-scope">
      <section className="kpi-section">
        <dl className="kpi-tiles kpi-headline">
          <Headline label={t('kpiTokens')}>
            <CountUp value={tokensOf(totals)} />
          </Headline>
          <Headline label={t('kpiRequests')}>
            <CountUp value={totals.requests} />
          </Headline>
          <Headline label={t('kpiSessions')}>
            <CountUp value={totals.sessions} />
          </Headline>
          <Headline label={t('kpiActive')}>{hours(totals.activeMinutes)}</Headline>
          <Headline label={t('kpiTools')}>
            <CountUp value={totals.toolCalls} />
          </Headline>
        </dl>
        {empty && <p className="kpi-empty">{t('kpiNoTokens')}</p>}
      </section>
      {!empty && (
        <>
          <section className="kpi-section" aria-labelledby="kpi-breakdown">
            <h3 id="kpi-breakdown">{t('kpiBreakdown')}</h3>
            <StackedBar totals={totals} />
          </section>
          <section className="kpi-section" aria-labelledby="kpi-days">
            <h3 id="kpi-days">
              {t('kpiDaily')} · {shown}d
            </h3>
            <DailyBars days={days} totals={scope.daily.slice(-shown)} />
          </section>
          {scope.models.length > 0 && (
            <section className="kpi-section" aria-labelledby="kpi-models">
              <h3 id="kpi-models">{t('kpiModels')}</h3>
              <ul className="share-list">
                {modelShares(scope).map((m) => (
                  <ShareRow
                    key={m.model}
                    label={m.model}
                    value={compact(m.tokens, locale)}
                    share={m.share}
                    note={`${Math.round(m.share * 100)}%`}
                  />
                ))}
              </ul>
            </section>
          )}
          {office === null && usage.projects.length > 0 && (
            <section className="kpi-section" aria-labelledby="kpi-projects">
              <h3 id="kpi-projects">{t('kpiProjects')}</h3>
              <ul className="share-list">
                {usage.projects.map((p) => (
                  <ShareRow
                    key={p.repo}
                    label={p.repo}
                    value={compact(tokensOf(p.scope.totals), locale)}
                    share={
                      tokensOf(p.scope.totals) /
                      Math.max(tokensOf(usage.projects[0]!.scope.totals), 1)
                    }
                  />
                ))}
              </ul>
            </section>
          )}
          {top.length > 0 && (
            <section className="kpi-section" aria-labelledby="kpi-top">
              <h3 id="kpi-top">{t('kpiTopSessions')}</h3>
              <ul className="share-list">
                {top.map((s) => (
                  <ShareRow
                    key={s.key}
                    label={titles.get(s.key) ?? `${s.provider} · ${s.repo}`}
                    value={compact(s.tokens, locale)}
                    share={s.tokens / Math.max(top[0]!.tokens, 1)}
                    note={`${s.requests} ${t('kpiRequests').toLowerCase()}`}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <KpiLimits limits={usage.limits} now={now} />
      <KpiGit kpi={kpi} loading={gitLoading} />
    </div>
  );
}
