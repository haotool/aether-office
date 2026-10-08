import type { GitKpi } from '@aether/contracts';
import { useT, useLocale } from '../ui/useT.js';
import { CountUp } from './CountUp.js';
import { Sparkline } from './kpi-charts.js';
import { compact } from './kpi-model.js';

function Tile({
  label,
  value,
  sub,
  spark,
}: {
  label: string;
  value: number | string;
  sub?: string | undefined;
  spark?: readonly number[];
}) {
  return (
    <div className="kpi-tile">
      <dt>{label}</dt>
      <dd>
        <span className="tile-figure">
          {typeof value === 'number' ? <CountUp value={value} /> : value}
          {spark && <Sparkline values={spark} />}
        </span>
        {sub && <small>{sub}</small>}
      </dd>
    </div>
  );
}

function GitTiles({ kpi }: { kpi: GitKpi }) {
  const t = useT();
  const locale = useLocale();
  return (
    <dl className="kpi-tiles">
      <Tile
        label={t('kpiCommits')}
        value={kpi.commits.today}
        sub={`7d ${kpi.commits.d7} · 30d ${kpi.commits.d30}`}
        spark={kpi.daily.slice(-14)}
      />
      <Tile
        label={t('kpiMergedBranches')}
        value={kpi.mergedBranches.d7}
        sub={`${t('kpiToday')} ${kpi.mergedBranches.today} · 30d ${kpi.mergedBranches.d30}`}
      />
      <Tile
        label={t('kpiMerges')}
        value={kpi.merges.d7}
        sub={`${t('kpiToday')} ${kpi.merges.today} · 30d ${kpi.merges.d30}`}
      />
      <Tile
        label={t('kpiOpenBranches')}
        value={kpi.openBranches}
        sub={
          kpi.longestOpenDays === null
            ? undefined
            : `${t('kpiOldestOpen')} ${kpi.longestOpenDays} ${t('kpiDays')}`
        }
      />
      <Tile label={t('kpiAuthors')} value={kpi.authors30} sub="30d" />
      <Tile
        label={t('kpiLines')}
        value={
          kpi.added30 === null || kpi.removed30 === null
            ? '—'
            : `+${compact(kpi.added30, locale)} −${compact(kpi.removed30, locale)}`
        }
        sub="30d"
      />
    </dl>
  );
}

type KpiGitProps = {
  kpi: GitKpi | null | undefined;
  loading: boolean;
  /** Repositories left out of the building's figures (only the most recently active are read). */
  omitted?: number;
};

/** Commits, merges, merged and open branches, authors, lines and the oldest open branch of a scope's repositories. */
export function KpiGit({ kpi, loading, omitted = 0 }: KpiGitProps) {
  const t = useT();
  return (
    <section className="kpi-section" aria-labelledby="kpi-git">
      <h3 id="kpi-git">{t('kpiGit')}</h3>
      {!kpi ? (
        <p className="kpi-empty">{loading ? t('loading') : t('kpiNoRepo')}</p>
      ) : (
        <GitTiles kpi={kpi} />
      )}
      {(kpi?.truncated || omitted > 0) && (
        <p className="kpi-warn" role="status">
          {kpi?.truncated ? `${t('kpiGitTruncated')} ` : ''}
          {omitted > 0 ? `${omitted} ${t('kpiGitOmitted')}` : ''}
        </p>
      )}
    </section>
  );
}
