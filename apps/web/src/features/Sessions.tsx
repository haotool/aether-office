import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AttributedSession, LocalSession } from '@aether/contracts';
import { DEPARTMENTS, ROLE_LABELS, type RoleId } from '@aether/kernel';
import { activityOf, formatSpan, sessionCommands, tokensByDepartment } from '../localSessions.js';
import { copyText } from '../browser-compat.js';
import { usePhoneAny } from '../phone.js';
import { DoorOpen } from 'lucide-react';
import { PageHeading, useT } from '../ui.js';
import { reapZombies } from './reap.js';
import { ClockOut } from './ClockOut.js';
import { idleSessions } from './clock-out.js';
import { StopSession } from './StopSession.js';

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

/** Every local session in one searchable list: what it is, where it runs, what it is doing, and how to pick it up. */
/** Rows drawn at first; the rest on request, so a long list does not make a phone render hundreds of cards. */
const PAGE = 30;

export function Sessions({
  sessions,
  locale,
  canStop = false,
}: {
  sessions: readonly AttributedSession[];
  locale: 'zh-TW' | 'en';
  canStop?: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [department, setDepartment] = useState('');
  const phone = usePhoneAny();
  // On a phone it opens on what is running; the rest is one tap away.
  const [runningOnly, setRunningOnly] = useState(phone);
  const [shown, setShown] = useState(PAGE);
  const [liveness, setLiveness] = useState('');
  const [stopping, setStopping] = useState<AttributedSession | null>(null);
  const [clockingOut, setClockingOut] = useState(false);
  const [copied, setCopied] = useState('');
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
  const now = Date.now();
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' });
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      [...sessions]
        .filter((s) => !provider || s.provider === provider)
        .filter((s) => !department || s.classification.department === department)
        .filter((s) => !runningOnly || s.process === 'running')
        .filter((s) => !liveness || s.liveness.state === liveness)
        .filter(
          (s) =>
            !q ||
            [s.title, s.repo, s.cwd, s.git?.branch, s.classification.role, s.usage.model]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
        )
        // Running sessions first (they are what you opened this page for), then by recency.
        .sort(
          (a, b) =>
            Number(b.process === 'running') - Number(a.process === 'running') || b.mtime - a.mtime,
        )
    );
  }, [sessions, query, provider, department, runningOnly, liveness]);
  useEffect(() => setShown(PAGE), [query, provider, department, runningOnly, liveness]);
  const copy = async (text: string, id: string) => {
    setCopied((await copyText(text)) ? id : '');
  };
  return (
    <>
      <PageHeading title={t('sessionsPage')} subtitle={t('sessionsHint')} />
      <div className="panel sessions-page">
        <div className="filters">
          <input
            type="search"
            aria-label={t('search')}
            placeholder={t('sessionsSearch')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="">Claude + Codex</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
          <select
            aria-label={t('floor')}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
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
            value={liveness}
            onChange={(e) => setLiveness(e.target.value)}
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
              checked={runningOnly}
              onChange={(e) => setRunningOnly(e.target.checked)}
            />
            {t('runningOnly')}
          </label>
          {canStop && idleSessions(sessions, 1).length > 0 && (
            <button className="secondary" onClick={() => setClockingOut(true)}>
              <DoorOpen size={16} aria-hidden="true" />
              {t('clockOut')} ({idleSessions(sessions, 1).length})
            </button>
          )}
          <span className="count">
            {rows.length} / {sessions.length}
          </span>
        </div>
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
              {rows.slice(0, shown).map((s) => {
                const commands = sessionCommands(s);
                const role = ROLE_LABELS[s.classification.role as RoleId];
                const window =
                  s.usage.contextWindow && s.usage.contextTokens !== null
                    ? Math.round((s.usage.contextTokens / s.usage.contextWindow) * 100)
                    : null;
                return (
                  <tr key={s.key}>
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
                      {s.liveness.state !== 'unknown' && (
                        <small className={`liveness ${s.liveness.state}`}>
                          {t(LIVENESS_LABEL[s.liveness.state])}
                          {s.liveness.quietMs !== null && (
                            <>
                              {' · '}
                              {t('quietFor')} {formatSpan(s.liveness.quietMs, locale)}
                            </>
                          )}
                          {s.liveness.zombies.length > 0 && (
                            <>
                              {' · '}
                              <span title={zombieTitle(s.liveness.zombies, t('zombieHint'))}>
                                {t('livenessZombie')} ×{s.liveness.zombies.length}
                              </span>
                            </>
                          )}
                          {s.liveness.startedAt !== null && (
                            <>
                              {' · '}
                              {t('runningFor')} {formatSpan(now - s.liveness.startedAt, locale)}
                            </>
                          )}
                        </small>
                      )}
                      {s.resources && (
                        <small>
                          {s.resources.cpuPercent.toFixed(0)}% ·{' '}
                          {Math.round(s.resources.rssBytes / 1e6)} MB
                        </small>
                      )}
                    </td>
                    <td data-label={t('model')}>
                      {s.usage.model ?? '—'}
                      {window !== null && <small>ctx {window}%</small>}
                    </td>
                    <td data-label={t('gitBranch')}>
                      {s.git?.branch ?? (s.git ? 'detached' : '—')}
                    </td>
                    <td data-label={t('preview')}>
                      {s.ports.length
                        ? s.ports.map((port) => (
                            <a
                              key={port}
                              href={`http://localhost:${port}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              :{port}
                            </a>
                          ))
                        : '—'}
                    </td>
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
                      <button
                        className="secondary"
                        onClick={() => void copy(commands.resume, `${s.key}:r`)}
                      >
                        {copied === `${s.key}:r` ? t('copied') : t('copyResume')}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => void copy(commands.fork, `${s.key}:f`)}
                      >
                        {copied === `${s.key}:f` ? t('copied') : t('copyFork')}
                      </button>
                      {canStop && s.process === 'running' && s.liveness.zombies.length > 0 && (
                        <button
                          className="secondary"
                          title={t('zombieHint')}
                          onClick={() => void reap(s)}
                        >
                          {reaped[s.key] ?? t('reapZombies')}
                        </button>
                      )}
                      {canStop && ['dormant', 'orphaned'].includes(s.liveness.state) && (
                        <button className="secondary danger" onClick={() => setStopping(s)}>
                          {t('stopAction')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > shown && (
          <button className="secondary full-width show-more" onClick={() => setShown(shown + PAGE)}>
            {t('showMore')} ({rows.length - shown})
          </button>
        )}
      </div>
      {stopping && (
        <StopSession session={stopping} locale={locale} onClose={() => setStopping(null)} />
      )}
      {clockingOut && (
        <ClockOut sessions={sessions} locale={locale} onClose={() => setClockingOut(false)} />
      )}
    </>
  );
}
