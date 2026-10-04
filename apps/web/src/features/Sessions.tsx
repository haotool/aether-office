import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AttributedSession } from '@aether/contracts';
import { DEPARTMENTS, ROLE_LABELS, type RoleId } from '@aether/kernel';
import { activityOf, sessionCommands, tokensByDepartment } from '../localSessions.js';
import { PageHeading, useT } from '../ui.js';

/** Every local session in one searchable list: what it is, where it runs, what it is doing, and how to pick it up. */
export function Sessions({
  sessions,
  locale,
}: {
  sessions: readonly AttributedSession[];
  locale: 'zh-TW' | 'en';
}) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('');
  const [department, setDepartment] = useState('');
  const [runningOnly, setRunningOnly] = useState(false);
  const [copied, setCopied] = useState('');
  const now = Date.now();
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' });
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...sessions]
      .filter((s) => !provider || s.provider === provider)
      .filter((s) => !department || s.classification.department === department)
      .filter((s) => !runningOnly || s.process === 'running')
      .filter(
        (s) =>
          !q ||
          [s.title, s.repo, s.cwd, s.git?.branch, s.classification.role, s.usage.model]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      )
      .sort((a, b) => b.mtime - a.mtime);
  }, [sessions, query, provider, department, runningOnly]);
  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied('');
    }
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
          <label>
            <input
              type="checkbox"
              checked={runningOnly}
              onChange={(e) => setRunningOnly(e.target.checked)}
            />
            {t('runningOnly')}
          </label>
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
          <table>
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
              {rows.map((s) => {
                const commands = sessionCommands(s);
                const role = ROLE_LABELS[s.classification.role as RoleId];
                const window =
                  s.usage.contextWindow && s.usage.contextTokens !== null
                    ? Math.round((s.usage.contextTokens / s.usage.contextWindow) * 100)
                    : null;
                return (
                  <tr key={s.key}>
                    <td title={s.cwd}>
                      <b>{s.provider === 'codex' ? 'CX' : 'CL'}</b> {s.title ?? s.repo}
                      <small>{s.repo}</small>
                    </td>
                    <td>
                      {role ? (locale === 'zh-TW' ? role.zh : role.en) : s.classification.role}
                    </td>
                    <td>
                      {activityOf(s, now)} · {s.process}
                      {s.resources && (
                        <small>
                          {s.resources.cpuPercent.toFixed(0)}% ·{' '}
                          {Math.round(s.resources.rssBytes / 1e6)} MB
                        </small>
                      )}
                    </td>
                    <td>
                      {s.usage.model ?? '—'}
                      {window !== null && <small>ctx {window}%</small>}
                    </td>
                    <td>{s.git?.branch ?? (s.git ? 'detached' : '—')}</td>
                    <td>
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
                          navigate(`/office?agent=${encodeURIComponent(`local:${s.key}`)}`)
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
