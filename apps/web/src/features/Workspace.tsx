import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Snapshot, Work } from '@aether/contracts';
import { api, execute } from '../api.js';
import { PageHeading, Empty, Badge, useT } from '../ui.js';
import { Reservations } from './Reservations.js';
export type WorkspaceData = {
  workspaces: {
    id: string;
    workId: string;
    purpose: 'implementation' | 'review';
    path: string;
    branch: string;
    baseSha: string;
    headSha: string;
    verifiers: string;
  }[];
  jobs: {
    id: string;
    workId: string;
    workspaceId: string;
    kind: string;
    state: string;
    result: string | null;
    createdAt: number;
    expectedHead: string;
    expectedVersion: number;
  }[];
};
export function jobMatchesWork(
  job: WorkspaceData['jobs'][number],
  work: Work | undefined,
): boolean {
  return (
    !!work &&
    job.expectedHead === work.headSha &&
    (job.expectedVersion === work.version ||
      (job.kind === 'verify' &&
        work.state === 'verified' &&
        work.verifiedSha === job.expectedHead &&
        work.version === job.expectedVersion + 1))
  );
}
export function JobEvidence({
  job,
  work,
}: {
  job: WorkspaceData['jobs'][number];
  work: Work | undefined;
}) {
  const t = useT();
  return (
    <p className="muted path-label">
      {t(jobMatchesWork(job, work) ? 'evidenceSnapshot' : 'historicalEvidence')} · {t('version')}{' '}
      {job.expectedVersion} · HEAD <code>{job.expectedHead}</code>
    </p>
  );
}
export function useWorkspaces(projectId: string) {
  return useQuery({
    queryKey: ['workspaces', projectId],
    queryFn: () => api<WorkspaceData>(`/api/projects/${projectId}/workspaces`),
    refetchInterval: 2000,
  });
}
export function Workspace({ snapshot }: { snapshot: Snapshot }) {
  const t = useT();
  const query = useWorkspaces(snapshot.project.id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeading title={t('workspace')} subtitle={t('workspaceHint')} />
      {error && <p role="alert">{error}</p>}
      {query.isPending ? (
        <p>{t('loading')}</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : !query.data?.workspaces.length ? (
        <Empty title={t('noWorkspaces')} hint={t('workspaceHint')} />
      ) : (
        query.data.workspaces.map((w) => {
          const work = snapshot.work.find((item) => item.id === w.workId);
          const job = query.data.jobs.find((j) => j.workspaceId === w.id && j.kind === 'diff');
          const result = job?.result
            ? (JSON.parse(job.result) as {
                diff?: { text: string; untracked: string[]; truncated: boolean };
                error?: string;
              })
            : null;
          return (
            <article className="panel workspace-card" key={w.id}>
              <h2>{work?.title ?? w.branch}</h2>
              <p>
                <code>{w.branch}</code> · {t(w.purpose === 'review' ? 'nativeReview' : 'workspace')}
              </p>
              <p className="muted path-label">{w.path}</p>
              <dl>
                <dt>Base</dt>
                <dd>{w.baseSha}</dd>
                <dt>HEAD</dt>
                <dd>{work?.headSha ?? w.headSha}</dd>
              </dl>
              <button
                disabled={
                  w.purpose === 'review' ||
                  busy ||
                  !work?.headSha ||
                  job?.state === 'queued' ||
                  job?.state === 'running'
                }
                onClick={async () => {
                  if (!work) return;
                  setBusy(true);
                  setError('');
                  try {
                    await execute(
                      'workspace.diff',
                      { workId: work.id },
                      snapshot.project.id,
                      work.version,
                    );
                    await query.refetch();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('loadDiff')}
              </button>
              {job && (
                <>
                  <JobEvidence job={job} work={work} />
                  <Badge state={job.state} />
                </>
              )}{' '}
              {result?.error && <p role="alert">{result.error}</p>}
              {result?.diff && (
                <>
                  <pre className="diff-view" tabIndex={0} aria-label={t('loadDiff')}>
                    {result.diff.text || t('noDiff')}
                  </pre>
                  {result.diff.truncated && <p>{t('diffTruncated')}</p>}
                  {result.diff.untracked.length > 0 && (
                    <p>
                      {t('untracked')}: {result.diff.untracked.join(', ')}
                    </p>
                  )}
                </>
              )}
            </article>
          );
        })
      )}
      <Reservations projectId={snapshot.project.id} />
    </>
  );
}
