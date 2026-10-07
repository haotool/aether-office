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
};
type Report = {
  defaultBranch: string;
  worktrees: Worktree[];
  staleBranches: string[];
  remoteMerged: string[];
  removable: string[];
  suggestions: string[];
};
type CleanResult = { path: string; outcome: string; reason?: string };
type Sizes = Record<string, number | null> | undefined;

export const bytes = (n: number | null) =>
  n === null
    ? '—'
    : n >= 1e9
      ? `${(n / 1e9).toFixed(1)} GB`
      : n >= 1e6
        ? `${(n / 1e6).toFixed(0)} MB`
        : `${Math.round(n / 1e3)} KB`;

const amount = (n: number | null) => (n === null ? '…' : bytes(n));

/** The report, and the sizes that follow it (the slow part, asked for once the report is on screen). */
function useGitHealthReport(projectId: string) {
  const query = useQuery({
    queryKey: ['git-health', projectId],
    queryFn: () => api<Report>(`/api/projects/${projectId}/git-health`),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const sizes = useQuery({
    queryKey: ['git-health-sizes', projectId],
    queryFn: () =>
      api<{ sizes: Record<string, number | null> }>(`/api/projects/${projectId}/git-health/sizes`),
    enabled: query.isSuccess,
    staleTime: 5 * 60 * 1000,
    retry: false,
  }).data?.sizes;
  return { query, sizes };
}

/** Removing the merged worktrees: the confirmation step, the request, and what the server did with each path. */
function useCleanup(projectId: string, removable: readonly Worktree[]) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CleanResult[] | null>(null);
  const [error, setError] = useState('');
  const clean = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ results: CleanResult[] }>(
        `/api/projects/${projectId}/git-health/clean`,
        { method: 'POST', body: JSON.stringify({ paths: removable.map((w) => w.path) }) },
      );
      setOutcome(result.results);
      setConfirming(false);
      await client.invalidateQueries({ queryKey: ['git-health', projectId] });
      await client.invalidateQueries({ queryKey: ['git-health-sizes', projectId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return { confirming, setConfirming, busy, outcome, error, clean };
}

function Readouts({
  r,
  total,
  reclaimable,
}: {
  r: Report;
  total: number | null;
  reclaimable: number | null;
}) {
  const t = useT();
  return (
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
        <dd>{amount(total)}</dd>
      </div>
      <div>
        <dt>{t('gitReclaimable')}</dt>
        <dd className="good">{amount(reclaimable)}</dd>
      </div>
    </dl>
  );
}

function CleanBar({
  cleanup,
  removable,
  sizeOf,
  reclaimable,
}: {
  cleanup: ReturnType<typeof useCleanup>;
  removable: readonly Worktree[];
  sizeOf: (path: string) => string;
  reclaimable: number | null;
}) {
  const t = useT();
  const { confirming, setConfirming, busy, clean } = cleanup;
  if (removable.length === 0) return null;
  if (!confirming)
    return (
      <button className="secondary" onClick={() => setConfirming(true)}>
        {t('gitClean')} · {removable.length} · {amount(reclaimable)}
      </button>
    );
  return (
    <div className="clean-confirm" role="group" aria-label={t('gitClean')}>
      <p>{t('gitCleanExplain')}</p>
      <ul className="mono-list">
        {removable.slice(0, 12).map((w) => (
          <li key={w.path}>
            {w.branch} · {sizeOf(w.path)}
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
  );
}

function CleanOutcome({ outcome }: { outcome: readonly CleanResult[] }) {
  const t = useT();
  const skipped = outcome.some((o) => o.outcome === 'skipped');
  return (
    <p role="status">
      {t('gitCleanDone')}: {outcome.filter((o) => o.outcome === 'removed').length} ·{' '}
      {t('gitCleanSkipped')}: {outcome.filter((o) => o.outcome === 'skipped').length}
      {skipped && (
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
  );
}

function WorktreeTable({
  worktrees,
  sizes,
  sizeOf,
}: {
  worktrees: readonly Worktree[];
  sizes: Sizes;
  sizeOf: (path: string) => string;
}) {
  const t = useT();
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
  // Largest first once the sizes are known; until then, most recently committed first.
  const sorted = [...worktrees].sort((a, b) =>
    sizes
      ? (sizes[b.path] ?? 0) - (sizes[a.path] ?? 0)
      : (b.lastCommitAt ?? 0) - (a.lastCommitAt ?? 0),
  );
  return (
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
              <td>{sizeOf(w.path)}</td>
              <td>{w.lastCommitAt ? new Date(w.lastCommitAt).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The loaded report: counts, the clean-up, and the table of worktrees. */
function GitHealthBody({ projectId, r, sizes }: { projectId: string; r: Report; sizes: Sizes }) {
  const t = useT();
  const sizeOf = (path: string) => (sizes ? bytes(sizes[path] ?? null) : '…');
  const removable = r.worktrees.filter((w) => r.removable.includes(w.path));
  const total = sizes ? Object.values(sizes).reduce<number>((n, s) => n + (s ?? 0), 0) : null;
  const reclaimable = sizes ? removable.reduce((n, w) => n + (sizes[w.path] ?? 0), 0) : null;
  const cleanup = useCleanup(projectId, removable);
  return (
    <section className="panel git-health">
      <h2>{t('gitHealth')}</h2>
      <Readouts r={r} total={total} reclaimable={reclaimable} />
      <CleanBar cleanup={cleanup} removable={removable} sizeOf={sizeOf} reclaimable={reclaimable} />
      {cleanup.error && <p role="alert">{cleanup.error}</p>}
      {cleanup.outcome && <CleanOutcome outcome={cleanup.outcome} />}
      <WorktreeTable worktrees={r.worktrees} sizes={sizes} sizeOf={sizeOf} />
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

/** Worktrees and branches already merged but still present, missing worktrees, and the space each takes. Read-only. */
export function GitHealth({ projectId }: { projectId: string }) {
  const t = useT();
  const { query, sizes } = useGitHealthReport(projectId);
  if (query.isPending) return <p className="panel">{t('gitHealthScanning')}</p>;
  if (query.error) return <p className="panel">{query.error.message}</p>;
  return <GitHealthBody projectId={projectId} r={query.data} sizes={sizes} />;
}
