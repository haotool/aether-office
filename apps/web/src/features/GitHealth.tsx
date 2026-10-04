import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useT } from '../ui.js';

type Worktree = {
  path: string;
  branch: string | null;
  main: boolean;
  locked: boolean;
  prunable: boolean;
  merged: boolean;
  dirty: number | null;
  lastCommitAt: number | null;
  sizeBytes: number | null;
};
type Report = {
  defaultBranch: string;
  worktrees: Worktree[];
  staleBranches: string[];
  remoteMerged: string[];
  totals: { sizeBytes: number; reclaimableBytes: number };
  suggestions: string[];
};

export const bytes = (n: number | null) =>
  n === null
    ? '—'
    : n >= 1e9
      ? `${(n / 1e9).toFixed(1)} GB`
      : n >= 1e6
        ? `${(n / 1e6).toFixed(0)} MB`
        : `${Math.round(n / 1e3)} KB`;

/** Worktrees and branches already merged but still present, missing worktrees, and the space each takes. Read-only. */
export function GitHealth({ projectId }: { projectId: string }) {
  const t = useT();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<
    { path: string; outcome: string; reason?: string }[] | null
  >(null);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['git-health', projectId],
    queryFn: () => api<Report>(`/api/projects/${projectId}/git-health`),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (query.isPending) return <p className="panel">{t('gitHealthScanning')}</p>;
  if (query.error) return <p className="panel">{query.error.message}</p>;
  const r = query.data;
  const state = (w: Worktree) =>
    w.prunable
      ? t('gitMissing')
      : w.main
        ? t('gitMain')
        : w.merged
          ? w.dirty
            ? t('gitMergedDirty')
            : t('gitMerged')
          : t('gitActive');
  const sorted = [...r.worktrees].sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
  const removable = r.worktrees.filter((w) => w.merged && w.dirty === 0 && !w.locked && !w.main);
  const clean = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ results: { path: string; outcome: string; reason?: string }[] }>(
        `/api/projects/${projectId}/git-health/clean`,
        { method: 'POST', body: JSON.stringify({ paths: removable.map((w) => w.path) }) },
      );
      setOutcome(result.results);
      setConfirming(false);
      await client.invalidateQueries({ queryKey: ['git-health', projectId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel git-health">
      <h2>{t('gitHealth')}</h2>
      <dl className="readouts-row">
        <div>
          <dt>{t('gitWorktrees')}</dt>
          <dd>{r.worktrees.length}</dd>
        </div>
        <div>
          <dt>{t('gitMergedCount')}</dt>
          <dd>{r.worktrees.filter((w) => w.merged).length}</dd>
        </div>
        <div>
          <dt>{t('gitStaleBranches')}</dt>
          <dd>{r.staleBranches.length}</dd>
        </div>
        <div>
          <dt>{t('gitRemoteMerged')}</dt>
          <dd>{r.remoteMerged.length}</dd>
        </div>
        <div>
          <dt>{t('gitTotalSize')}</dt>
          <dd>{bytes(r.totals.sizeBytes)}</dd>
        </div>
        <div>
          <dt>{t('gitReclaimable')}</dt>
          <dd className="good">{bytes(r.totals.reclaimableBytes)}</dd>
        </div>
      </dl>
      {removable.length > 0 &&
        (confirming ? (
          <div className="clean-confirm" role="group" aria-label={t('gitClean')}>
            <p>{t('gitCleanExplain')}</p>
            <ul className="mono-list">
              {removable.slice(0, 12).map((w) => (
                <li key={w.path}>
                  {w.branch} · {bytes(w.sizeBytes)}
                </li>
              ))}
              {removable.length > 12 && <li>… +{removable.length - 12}</li>}
            </ul>
            <div className="button-row">
              <button className="primary" disabled={busy} onClick={() => void clean()}>
                {busy ? t('loading') : `${t('gitCleanConfirm')} (${removable.length})`}
              </button>
              <button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                {t('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button className="secondary" onClick={() => setConfirming(true)}>
            {t('gitClean')} · {removable.length} · {bytes(r.totals.reclaimableBytes)}
          </button>
        ))}
      {error && <p role="alert">{error}</p>}
      {outcome && (
        <p role="status">
          {t('gitCleanDone')}: {outcome.filter((o) => o.outcome === 'removed').length} ·{' '}
          {t('gitCleanSkipped')}: {outcome.filter((o) => o.outcome === 'skipped').length}
          {outcome.some((o) => o.outcome === 'skipped') && (
            <small>
              {' '}
              (
              {[...new Set(outcome.filter((o) => o.reason).map((o) => o.reason))]
                .slice(0, 3)
                .join('; ')}
              )
            </small>
          )}
        </p>
      )}
      <div className="table-scroll" tabIndex={0} aria-label={t('gitWorktrees')}>
        <table>
          <thead>
            <tr>
              <th>{t('gitBranch')}</th>
              <th>{t('status')}</th>
              <th>{t('gitDirty')}</th>
              <th>{t('gitSize')}</th>
              <th>{t('gitLastCommit')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((w) => (
              <tr key={w.path} className={w.merged && !w.dirty ? 'reclaimable' : ''}>
                <td title={w.path}>{w.branch ?? '(detached)'}</td>
                <td>{state(w)}</td>
                <td>{w.dirty ?? '—'}</td>
                <td>{bytes(w.sizeBytes)}</td>
                <td>{w.lastCommitAt ? new Date(w.lastCommitAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.suggestions.length > 0 && (
        <details>
          <summary>
            {t('gitSuggestions')} ({r.suggestions.length})
          </summary>
          <p>{t('gitSuggestionsNote')}</p>
          <pre className="suggestions" tabIndex={0}>
            {r.suggestions.join('\n')}
          </pre>
        </details>
      )}
    </section>
  );
}
