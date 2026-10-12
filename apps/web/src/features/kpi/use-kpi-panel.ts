import { useMemo, useState } from 'react';
import { translate } from '../../lib/i18n/i18n.js';
import { useCachedSessions } from '../sessions/character-session.js';
import { floorBadges, runningSessions, type Range } from '../kpi/kpi-model.js';
import { useGitKpi, useUsage } from './use-kpi.js';
import { useLocale } from '../../ui/useT.js';

/** One hook so the desktop page and the phone page cannot differ. */
export function useKpiPanel() {
  const locale = useLocale();
  const sessions = useCachedSessions();
  const usage = useUsage('7d');
  const git = useGitKpi();
  const [panel, setPanel] = useState<{ office: number | null } | null>(null);
  const [range, setRange] = useState<Range>('7d');
  const badges = useMemo(
    () =>
      floorBadges(usage.data, git.data, locale, {
        tokens: translate(locale, 'kpiTokensToday'),
        merged: translate(locale, 'kpiMerged7'),
      }),
    [usage.data, git.data, locale],
  );
  return {
    usage: usage.data,
    git: git.data,
    sessions,
    running: runningSessions(sessions),
    badges,
    range,
    setRange,
    office: panel?.office ?? null,
    isOpen: panel !== null,
    open: (office: number | null = null) => setPanel({ office }),
    setOffice: (office: number | null) => setPanel({ office }),
    close: () => setPanel(null),
  };
}
export type KpiPanel = ReturnType<typeof useKpiPanel>;
