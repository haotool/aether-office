import type { ReactNode } from 'react';
import type { AttributedSession, GitKpiResponse, UsageResponse } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { emptyScope } from '../usage-compat.js';
import { CountUp } from './CountUp.js';
import { DailyBars, ShareRow, StackedBar } from './kpi-charts.js';
import { KpiGit } from './KpiGit.js';
import { KpiLimits } from './KpiLimits.js';
import { compact, modelShares, tokensOf, type Range } from './kpi-model.js';

const hours = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
const SHOWN_DAYS = { today: 7, '7d': 7, '30d': 30 } as const;

function Headline({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="kpi-tile" title={title}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

type Scope = UsageResponse['building'];

function ScanWarning({ scan }: { scan: UsageResponse['scan'] }) {
  const t = useT();
  if (!scan.truncated && scan.failedFiles === 0 && scan.skippedLines === 0) return null;
  return (
    <p className="kpi-warn" role="status">
      {scan.truncated && (
        <>
          {t('kpiTruncated')}: {scan.files} / {scan.found}.{' '}
        </>
      )}
      {(scan.failedFiles > 0 || scan.skippedLines > 0) && (
        <>
          {t('kpiScanIssues')}: {scan.failedFiles} · {scan.skippedLines}.
        </>
      )}
    </p>
  );
}

/** The five headline figures, and the notes under them when there is nothing to count or some of it has no office. */
function HeadlineSection({ totals, unplaced }: { totals: Scope['totals']; unplaced: number }) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const empty = tokensOf(totals) === 0 && totals.cacheRead === 0;
  return (
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
        <Headline label={t('kpiActive')} title={t('kpiActiveNote')}>
          {hours(totals.activeMinutes)}
        </Headline>
        <Headline label={t('kpiTools')}>
          <CountUp value={totals.toolCalls} />
        </Headline>
      </dl>
      {empty && <p className="kpi-empty">{t('kpiNoTokens')}</p>}
      {unplaced > 0 && (
        <p className="kpi-note">
          <b>{t('kpiUnplaced')}</b>: {compact(unplaced, locale)} · {t('kpiUnplacedNote')}
        </p>
      )}
    </section>
  );
}

function ShareSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="kpi-section" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <ul className="share-list">{children}</ul>
    </section>
  );
}

/** Tokens by model, by project (the whole building only) and by the heaviest sessions. */
function ShareSections({
  scope,
  usage,
  office,
  top,
  titles,
}: {
  scope: Scope;
  usage: UsageResponse;
  office: number | null;
  top: UsageResponse['sessions'];
  titles: ReadonlyMap<string, string | null>;
}) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const heaviestProject = Math.max(tokensOf(usage.projects[0]?.scope.totals ?? scope.totals), 1);
  return (
    <>
      {scope.models.length > 0 && (
        <ShareSection id="kpi-models" title={t('kpiModels')}>
          {modelShares(scope).map((m) => (
            <ShareRow
              key={m.model}
              label={m.model === 'unknown' ? t('kpiModelUnknown') : m.model}
              value={compact(m.tokens, locale)}
              share={m.share}
              note={`${Math.round(m.share * 100)}%`}
            />
          ))}
        </ShareSection>
      )}
      {office === null && usage.projects.length > 0 && (
        <ShareSection id="kpi-projects" title={t('kpiProjects')}>
          {usage.projects.map((p) => (
            <ShareRow
              key={p.repo}
              label={p.repo}
              value={compact(tokensOf(p.scope.totals), locale)}
              share={tokensOf(p.scope.totals) / heaviestProject}
            />
          ))}
        </ShareSection>
      )}
      {top.length > 0 && (
        <ShareSection id="kpi-top" title={t('kpiTopSessions')}>
          {top.map((s) => (
            <ShareRow
              key={s.key}
              label={titles.get(s.key) ?? `${s.provider} · ${s.repo}`}
              value={compact(s.tokens, locale)}
              share={s.tokens / Math.max(top[0]?.tokens ?? 0, 1)}
              note={`${s.requests} ${t('kpiRequests').toLowerCase()}`}
            />
          ))}
        </ShareSection>
      )}
    </>
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
  const department = office === null ? null : (DEPARTMENTS[office] ?? null);
  // An office that is not in the answer is an empty one: never the building's numbers under the office's name.
  const scope =
    office === null
      ? usage.building
      : (usage.offices.find((o) => o.floor === office)?.scope ?? emptyScope(usage.days.length));
  const kpi = office === null ? git?.building : git?.offices.find((o) => o.floor === office)?.kpi;
  const totals = scope.totals;
  const shown = SHOWN_DAYS[range];
  const top = usage.sessions.filter((s) => department === null || s.department === department.id);
  const titles = new Map(sessions.map((s) => [s.key, s.title]));
  const empty = tokensOf(totals) === 0 && totals.cacheRead === 0;
  return (
    <div className="kpi-scope">
      <ScanWarning scan={usage.scan} />
      <HeadlineSection totals={totals} unplaced={tokensOf(usage.unplaced.totals)} />
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
            <DailyBars days={usage.days.slice(-shown)} totals={scope.daily.slice(-shown)} />
          </section>
          <ShareSections scope={scope} usage={usage} office={office} top={top} titles={titles} />
        </>
      )}
      <KpiLimits limits={usage.limits} now={now} timeZone={usage.timezone} />
      <KpiGit
        kpi={kpi}
        loading={gitLoading}
        omitted={office === null ? (git?.omittedRepos ?? 0) : 0}
      />
    </div>
  );
}
