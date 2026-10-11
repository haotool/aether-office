import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AttributedSession } from '@aether/contracts';
import { copyText } from '../../lib/platform/browser-compat.js';
import { usePhoneAny } from '../../lib/preferences/phone.js';
import { DoorOpen } from 'lucide-react';
import { Empty } from '../../ui/Empty.js';
import { PageHeading } from '../../ui/PageHeading.js';
import { useT } from '../../ui/useT.js';
import { reapZombies } from '../operations/reap.js';
import { SessionDialogs } from './SessionDialogs.js';
import { idleSessions } from '../operations/clock-out.js';
import { DepartmentTokens, FilterBar } from './SessionFilterBar.js';
import { SessionsTable, type RowActions } from './SessionsTable.js';
import { filterSessions, type SessionFilters } from './sessions-filter.js';

type SessionsProps = {
  sessions: readonly AttributedSession[];
  locale: Locale;
  canStop?: boolean;
};

/** Rows drawn at first; the rest on request, so a long list does not make a phone render hundreds of cards. */
const PAGE = 30;
const SHOW_ALL: SessionFilters = {
  query: '',
  provider: '',
  department: '',
  runningOnly: false,
  liveness: '',
};

type Locale = 'zh-TW' | 'en';
function useReaper() {
  const t = useT();
  const client = useQueryClient();
  const [reaped, setReaped] = useState<Record<string, string>>({});
  const reap = async (s: AttributedSession) => {
    try {
      const r = await reapZombies(s);
      setReaped((all) => ({
        ...all,
        [s.key]: r.after === 0 ? t('reapCleared') : t('reapRemaining'),
      }));
      await client.invalidateQueries({ queryKey: ['local-sessions'] });
    } catch (e) {
      setReaped((all) => ({ ...all, [s.key]: e instanceof Error ? e.message : 'REQUEST_FAILED' }));
    }
  };
  return { reaped, reap };
}

function useSessionsList(sessions: readonly AttributedSession[], canStop: boolean) {
  const phone = usePhoneAny();
  const [filters, setFilters] = useState<SessionFilters>({
    query: '',
    provider: '',
    department: '',
    runningOnly: phone,
    liveness: '',
  });
  const [shown, setShown] = useState(PAGE);
  const [stopping, setStopping] = useState<AttributedSession | null>(null);
  const [clockingOut, setClockingOut] = useState(false);
  const [copied, setCopied] = useState('');
  const { reaped, reap } = useReaper();
  const rows = useMemo(() => filterSessions(sessions, filters), [sessions, filters]);
  const { query, provider, department, runningOnly, liveness } = filters;
  useEffect(() => setShown(PAGE), [query, provider, department, runningOnly, liveness]);
  const actions: RowActions = {
    canStop,
    copied,
    reaped,
    onCopy: (text, id) => void copyText(text).then((ok) => setCopied(ok ? id : '')),
    onReap: (s) => void reap(s),
    onStop: setStopping,
  };
  return {
    ...{ filters, setFilters, shown, setShown, rows, actions },
    ...{ stopping, setStopping, clockingOut, setClockingOut },
  };
}

function SessionsEmpty({ none, onShowAll }: { none: boolean; onShowAll: () => void }) {
  const t = useT();
  return (
    <Empty
      title={t(none ? 'sessionsNone' : 'sessionsNoMatch')}
      hint={none ? t('sessionsNoneHint') : undefined}
      action={
        !none && (
          <button className="secondary" onClick={onShowAll}>
            {t('sessionsShowAll')}
          </button>
        )
      }
    />
  );
}

export function Sessions({ sessions, locale, canStop = false }: SessionsProps) {
  const t = useT();
  const list = useSessionsList(sessions, canStop);
  const { rows, shown } = list;
  const idleCount = idleSessions(sessions, 1).length;
  return (
    <>
      <PageHeading title={t('sessionsPage')} subtitle={t('sessionsHint')} />
      <div className="panel sessions-page">
        <FilterBar
          filters={list.filters}
          onChange={(next) => list.setFilters((f) => ({ ...f, ...next }))}
          locale={locale}
        >
          {canStop && idleCount > 0 && (
            <button className="secondary" onClick={() => list.setClockingOut(true)}>
              <DoorOpen size={16} aria-hidden="true" />
              {t('clockOut')} ({idleCount})
            </button>
          )}
          <span className="count">
            {rows.length} / {sessions.length}
          </span>
        </FilterBar>
        <DepartmentTokens rows={rows} locale={locale} />
        {rows.length === 0 ? (
          <SessionsEmpty none={sessions.length === 0} onShowAll={() => list.setFilters(SHOW_ALL)} />
        ) : (
          <SessionsTable rows={rows.slice(0, shown)} locale={locale} actions={list.actions} />
        )}
        {rows.length > shown && (
          <button
            className="secondary full-width show-more"
            onClick={() => list.setShown(shown + PAGE)}
          >
            {t('showMore')} ({rows.length - shown})
          </button>
        )}
      </div>
      <SessionDialogs
        {...{ sessions, locale, stopping: list.stopping, clockingOut: list.clockingOut }}
        onStopClose={() => list.setStopping(null)}
        onClockOutClose={() => list.setClockingOut(false)}
      />
    </>
  );
}
