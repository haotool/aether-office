import { BarChart3 } from 'lucide-react';
import type { GitKpiResponse, UsageResponse } from '@aether/contracts';
import { useT } from '../../ui/useT.js';
import { CountUp } from './CountUp.js';
import { Sparkline } from './kpi-charts.js';
import { lastDay, tokensOf } from './kpi-model.js';

function Cell({
  label,
  onOpen,
  children,
}: {
  label: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="kpi-cell" onClick={onOpen}>
      <small>{label}</small>
      {children}
    </button>
  );
}

type KpiStripProps = {
  usage: UsageResponse | undefined;
  git: GitKpiResponse | undefined;
  running: number;
  onOpen: () => void;
};

export function KpiStrip({ usage, git, running, onOpen }: KpiStripProps) {
  const t = useT();
  if (!usage) return null;
  if (!usage.enabled)
    return (
      <div className="kpi-strip" role="group" aria-label={t('kpiTitle')}>
        <span className="kpi-off">{t('kpiLocalOff')}</span>
      </div>
    );
  const days = usage.building.daily;
  const week = days.slice(-7).map(tokensOf);
  const kpi = git?.building;
  const figure = (value: number | undefined) =>
    value === undefined ? (
      <b className="kpi-none">—</b>
    ) : (
      <b>
        <CountUp value={value} />
      </b>
    );
  return (
    <div className="kpi-strip" role="group" aria-label={t('kpiTitle')}>
      <Cell label={t('kpiTokensToday')} onOpen={onOpen}>
        <b>
          <CountUp value={tokensOf(lastDay(usage.building))} />
        </b>
        <Sparkline values={week} />
      </Cell>
      <Cell label={t('kpiRunning')} onOpen={onOpen}>
        {figure(running)}
      </Cell>
      <Cell label={t('kpiCommitsToday')} onOpen={onOpen}>
        {figure(kpi?.commits.today)}
      </Cell>
      <Cell label={t('kpiMerged7')} onOpen={onOpen}>
        {figure(kpi?.mergedBranches.d7)}
      </Cell>
      {!usage.scan.complete && <span className="kpi-scan">{t('kpiScanning')}</span>}
      <button className="kpi-open" onClick={onOpen} aria-label={t('kpiOpen')} title={t('kpiOpen')}>
        <BarChart3 size={16} />
      </button>
    </div>
  );
}
