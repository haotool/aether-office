import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AttributedSession, LocalSession } from '@aether/contracts';
import { DEPARTMENTS, ROLE_LABELS, type RoleId } from '@aether/kernel';
import { activityOf, formatSpan, sessionCommands, tokensByDepartment } from '../localSessions.js';
import { copyText } from '../browser-compat.js';
import { usePhoneAny } from '../phone.js';
import { DoorOpen } from 'lucide-react';
import { contextLabel } from './context-label.js';
import { PageHeading, useT } from '../ui.js';
import { reapZombies } from './reap.js';
import { SessionDialogs } from './SessionDialogs.js';
import { idleSessions } from './clock-out.js';
import { filterSessions, type SessionFilters } from './sessions-filter.js';

const LIVENESS_LABEL = {
  active: 'livenessActive',
  idle: 'livenessIdle',
  dormant: 'livenessDormant',
  orphaned: 'livenessOrphaned',
  ended: 'livenessEnded',
  unknown: 'livenessUnknown',
} as const;

/** What a zombie was, for a tooltip: "node (pid 123), ?" — the program it was last seen as, or ? when it never was. */
const zombieTitle = (zombies: LocalSession['liveness']['zombies'], hint: string) =>
  `${zombies.map((z) => `${z.program ?? '?'} (pid ${z.pid})`).join(', ')}\n${hint}`;

/** Rows drawn at first; the rest on request, so a long list does not make a phone render hundreds of cards. */
const PAGE = 30;

type Locale = 'zh-TW' | 'en';
type Filters = SessionFilters;
/** Reaping zombies of one session, and the short outcome text each row shows afterwards. */
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

function SessionFilters({
  filters,
  onChange,
  locale,
  children,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  locale: Locale;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="filters">
      <input
        type="search"
        aria-label={t('search')}
        placeholder={t('sessionsSearch')}
        value={filters.query}
        onChange={(e) => onChange({ query: e.target.value })}
      />
      <select
        aria-label="provider"
        value={filters.provider}
        onChange={(e) => onChange({ provider: e.target.value })}
      >
        <option value="">Claude + Codex</option>
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
      </select>
      <select
        aria-label={t('floor')}
        value={filters.department}
        onChange={(e) => onChange({ department: e.target.value })}
      >
        <option value="">{t('allDepartments')}</option>
        {DEPARTMENTS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.floor + 1}F · {locale === 'zh-TW' ? d.zh : d.en}
          </option>
        ))}
      </select>
      <select
        aria-label={t('status')}
        value={filters.liveness}
        onChange={(e) => onChange({ liveness: e.target.value })}
      >
        <option value="">{t('allLiveness')}</option>
        {(['active', 'idle', 'dormant', 'orphaned', 'ended'] as const).map((state) => (
          <option key={state} value={state}>
            {t(LIVENESS_LABEL[state])}
          </option>
        ))}
      </select>
      <label>
        <input
          type="checkbox"
          checked={filters.runningOnly}
          onChange={(e) => onChange({ runningOnly: e.target.checked })}
        />
        {t('runningOnly')}
      </label>
      {children}
    </div>
  );
}

function DepartmentTokens({
  rows,
  locale,
}: {
  rows: readonly AttributedSession[];
  locale: Locale;
}) {
  const t = useT();
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' });
  return (
    <ul className="token-split" aria-label={t('tokensByDepartment')}>
      {tokensByDepartment(rows).map((d) => {
        const dept = DEPARTMENTS.find((x) => x.id === d.department);
        return (
          <li key={d.department}>
            <span>{dept ? (locale === 'zh-TW' ? dept.zh : dept.en) : d.department}</span>
            <b>{compact.format(d.tokens)}</b>
            <small>
              {d.sessions} {t('sessionCount')}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

/** The liveness line under a status: how long quiet, zombies left over, how long it has run. */
function LivenessNote({ s, now, locale }: { s: AttributedSession; now: number; locale: Locale }) {
  const t = useT();
  const { liveness } = s;
  return (
    <small className={`liveness ${liveness.state}`}>
      {t(LIVENESS_LABEL[liveness.state])}
      {liveness.quietMs !== null && (
        <>
          {' · '}
          {t('quietFor')} {formatSpan(liveness.quietMs, locale)}
        </>
      )}
      {liveness.zombies.length > 0 && (
        <>
          {' · '}
          <span title={zombieTitle(liveness.zombies, t('zombieHint'))}>
            {t('livenessZombie')} ×{liveness.zombies.length}
          </span>
        </>
      )}
      {liveness.startedAt !== null && (
        <>
          {' · '}
          {t('runningFor')} {formatSpan(now - liveness.startedAt, locale)}
        </>
      )}
    </small>
  );
}

function PreviewLinks({ ports }: { ports: readonly number[] }) {
  if (!ports.length) return <>—</>;
  return (
    <>
      {ports.map((port) => (
        <a key={port} href={`http://localhost:${port}`} target="_blank" rel="noopener noreferrer">
          :{port}
        </a>
      ))}
    </>
  );
}

type RowActions = {
  canStop: boolean;
  copied: string;
  reaped: Record<string, string>;
  onCopy: (text: string, id: string) => void;
  onReap: (s: AttributedSession) => void;
  onStop: (s: AttributedSession) => void;
};

function SessionActions({ s, actions }: { s: AttributedSession; actions: RowActions }) {
  const t = useT();
  const navigate = useNavigate();
  const { canStop, copied, reaped, onCopy, onReap, onStop } = actions;
  const commands = sessionCommands(s);
  return (
    <td className="actions">
      <button
        className="secondary"
        onClick={() =>
          navigate(
            `/office?${s.projectId ? `project=${s.projectId}&` : ''}agent=${encodeURIComponent(`local:${s.key}`)}&focus=1`,
          )
        }
      >
        {t('showInOffice')}
      </button>
      <button className="secondary" onClick={() => onCopy(commands.resume, `${s.key}:r`)}>
        {copied === `${s.key}:r` ? t('copied') : t('copyResume')}
      </button>
      <button className="secondary" onClick={() => onCopy(commands.fork, `${s.key}:f`)}>
        {copied === `${s.key}:f` ? t('copied') : t('copyFork')}
      </button>
      {canStop && s.process === 'running' && s.liveness.zombies.length > 0 && (
        <button className="secondary" title={t('zombieHint')} onClick={() => onReap(s)}>
          {reaped[s.key] ?? t('reapZombies')}
        </button>
      )}
      {canStop && ['dormant', 'orphaned'].includes(s.liveness.state) && (
        <button className="secondary danger" onClick={() => onStop(s)}>
          {t('stopAction')}
        </button>
      )}
    </td>
  );
}

function SessionRow({
  s,
  now,
  locale,
  actions,
}: {
  s: AttributedSession;
  now: number;
  locale: Locale;
  actions: RowActions;
}) {
  const t = useT();
  const role = ROLE_LABELS[s.classification.role as RoleId];
  const window = s.usage.contextPct === null ? null : Math.round(s.usage.contextPct);
  return (
    <tr>
      <td title={s.cwd}>
        <b>{s.provider === 'codex' ? 'CX' : 'CL'}</b>{' '}
        {s.title ?? (s.cwd.split('/').pop() || s.repo)}
        <small>{s.repo}</small>
      </td>
      <td data-label={t('jobRole')}>
        {role ? (locale === 'zh-TW' ? role.zh : role.en) : s.classification.role}
      </td>
      <td data-label={t('status')}>
        {activityOf(s, now)} · {s.process}
        {s.liveness.state !== 'unknown' && <LivenessNote s={s} now={now} locale={locale} />}
        {s.resources && (
          <small>
            {s.resources.cpuPercent.toFixed(0)}% · {Math.round(s.resources.rssBytes / 1e6)} MB
          </small>
        )}
      </td>
      <td data-label={t('model')}>
        {s.usage.model ?? '—'}
        {window !== null && (
          <small title={contextLabel(s.usage, t, locale) ?? undefined}>ctx {window}%</small>
        )}
      </td>
      <td data-label={t('gitBranch')}>{s.git?.branch ?? (s.git ? 'detached' : '—')}</td>
      <td data-label={t('preview')}>
        <PreviewLinks ports={s.ports} />
      </td>
      <SessionActions s={s} actions={actions} />
    </tr>
  );
}

/** The list's state: the filters, how many rows show, the dialogs, and what a row's buttons do. */
function useSessionsList(sessions: readonly AttributedSession[], canStop: boolean) {
  const phone = usePhoneAny();
  // On a phone it opens on what is running; the rest is one tap away.
  const [filters, setFilters] = useState<Filters>({
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

function SessionsTable({
  rows,
  locale,
  actions,
}: {
  rows: readonly AttributedSession[];
  locale: Locale;
  actions: RowActions;
}) {
  const t = useT();
  const now = Date.now();
  return (
    <div className="table-scroll" tabIndex={0} aria-label={t('sessionsPage')}>
      <table className="stack">
        <thead>
          <tr>
            <th>{t('sessionTitle')}</th>
            <th>{t('jobRole')}</th>
            <th>{t('status')}</th>
            <th>{t('model')}</th>
            <th>{t('gitBranch')}</th>
            <th>{t('preview')}</th>
            <th>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <SessionRow key={s.key} s={s} now={now} locale={locale} actions={actions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every local session in one searchable list: what it is, where it runs, what it is doing, and how to pick it up. */
export function Sessions({
  sessions,
  locale,
  canStop = false,
}: {
  sessions: readonly AttributedSession[];
  locale: Locale;
  canStop?: boolean;
}) {
  const t = useT();
  const list = useSessionsList(sessions, canStop);
  const { rows, shown } = list;
  const idleCount = idleSessions(sessions, 1).length;
  return (
    <>
      <PageHeading title={t('sessionsPage')} subtitle={t('sessionsHint')} />
      <div className="panel sessions-page">
        <SessionFilters
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
        </SessionFilters>
        <DepartmentTokens rows={rows} locale={locale} />
        <SessionsTable rows={rows.slice(0, shown)} locale={locale} actions={list.actions} />
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
