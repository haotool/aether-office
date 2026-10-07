import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { KpiScopeView } from './KpiScopeView.js';
import { RANGES, type Range } from './kpi-model.js';
import { useGitKpi, useUsage } from './use-kpi.js';
import type { KpiPanel } from './use-kpi-panel.js';

const RANGE_WORD = { today: 'kpiRangeToday', '7d': 'kpiRange7', '30d': 'kpiRange30' } as const;

/** The dashboard bound to the page's KPI state (see use-kpi-panel.ts). */
export function KpiDashboardHost({ kpi }: { kpi: KpiPanel }) {
  return (
    <KpiDashboard
      office={kpi.office}
      range={kpi.range}
      sessions={kpi.sessions}
      onOffice={kpi.setOffice}
      onRange={kpi.setRange}
      onClose={kpi.close}
    />
  );
}

/**
 * The KPI dashboard: a dialog (a side panel on a desktop, a bottom sheet on a phone) with the building and each office
 * as tabs and the range as a switch. `office` null is the whole building.
 */
export function KpiDashboard({
  office,
  range,
  sessions,
  onOffice,
  onRange,
  onClose,
}: {
  office: number | null;
  range: Range;
  sessions: readonly AttributedSession[];
  onOffice: (office: number | null) => void;
  onRange: (range: Range) => void;
  onClose: () => void;
}) {
  const t = useT();
  const zh = usePreferences((s) => s.locale) === 'zh-TW';
  const dialog = useRef<HTMLDialogElement>(null);
  const usage = useUsage(range);
  const git = useGitKpi();
  useEffect(() => {
    const el = dialog.current;
    const opener = document.activeElement;
    el?.showModal();
    return () => {
      el?.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="kpi-dialog"
      aria-label={t('kpiTitle')}
      onCancel={onClose}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <header className="kpi-head u-head">
        <h2>{t('kpiTitle')}</h2>
        <div className="segmented" role="group" aria-label={t('kpiRange')}>
          {RANGES.map((r) => (
            <button
              key={r}
              aria-pressed={r === range}
              className={r === range ? 'selected' : ''}
              onClick={() => onRange(r)}
            >
              {t(RANGE_WORD[r])}
            </button>
          ))}
        </div>
        <button className="icon-button" aria-label={t('close')} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <nav className="kpi-offices" aria-label={t('kpiOffices')}>
        <button className="u-chip" aria-pressed={office === null} onClick={() => onOffice(null)}>
          {t('kpiBuilding')}
        </button>
        {DEPARTMENTS.map((d) => (
          <button
            key={d.id}
            className="u-chip"
            aria-pressed={office === d.floor}
            style={{ ['--accent' as string]: d.accent }}
            title={zh ? d.zh : d.en}
            onClick={() => onOffice(d.floor)}
          >
            <b>{d.floor + 1}F</b>
            <span>{zh ? d.zh : d.en}</span>
          </button>
        ))}
      </nav>
      <div className="kpi-body">
        {usage.data ? (
          usage.data.enabled ? (
            <KpiScopeView
              usage={usage.data}
              git={git.data}
              gitLoading={git.isLoading}
              office={office}
              range={range}
              sessions={sessions}
              now={Date.now()}
            />
          ) : (
            <p className="kpi-empty">{t('kpiLocalOff')}</p>
          )
        ) : (
          <p className="kpi-empty">{usage.isError ? t('kpiUnavailable') : t('loading')}</p>
        )}
        <p className="kpi-note">
          {t('kpiNoteTokens')} {t('kpiNoteCost')}
          {usage.data ? ` ${t('kpiTimezone')} ${usage.data.timezone}.` : ''}
        </p>
      </div>
    </dialog>
  );
}
