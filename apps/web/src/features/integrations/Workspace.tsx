import { GitGraph } from '../tasks-git/GitGraph.js';
import { GitHealth } from '../tasks-git/GitHealth.js';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Snapshot, Work } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { PageHeading } from '../../ui/PageHeading.js';
import { Empty } from '../../ui/Empty.js';
import { Badge } from '../../ui/Badge.js';
import { useT, useWhy } from '../../ui/useT.js';
import { Reservations } from '../operations/Reservations.js';
type WorkspaceData = {
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
function jobMatchesWork(job: WorkspaceData['jobs'][number], work: Work | undefined): boolean {
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
type WorkspaceRow = WorkspaceData['workspaces'][number];
type WorkspaceJob = WorkspaceData['jobs'][number];
type DiffResult = {
  diff?: { text: string; untracked: string[]; truncated: boolean };
  error?: string;
};

/** Asks for the diff of a work item's workspace; `error` keeps the last failure. */
function useLoadDiff(projectId: string, refetch: () => Promise<unknown>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async (work: Work) => {
    setBusy(true);
    setError('');
    try {
      await execute('workspace.diff', { workId: work.id }, projectId, work.version);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, load };
}

function DiffView({ result }: { result: DiffResult }) {
  const t = useT();
  return (
    <>
      {result.error && <p role="alert">{result.error}</p>}
      {result.diff && (
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
    </>
  );
}

type WorkspaceCardProps = {
  workspace: WorkspaceRow;
  work: Work | undefined;
  job: WorkspaceJob | undefined;
  busy: boolean;
  onLoadDiff: (work: Work) => void;
};

function WorkspaceCard({ workspace: w, work, job, busy, onLoadDiff }: WorkspaceCardProps) {
  const t = useT();
  const whyNot = useWhy();
  const result = job?.result ? (JSON.parse(job.result) as DiffResult) : null;
  const running = job?.state === 'queued' || job?.state === 'running';
  return (
    <article className="panel workspace-card">
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
        disabled={w.purpose === 'review' || busy || !work?.headSha || running}
        {...whyNot(
          [w.purpose !== 'review', 'whyNoDiff'],
          [!busy && !running, 'whyBusy'],
          [!!work?.headSha, 'whyNoCommit'],
        )}
        onClick={() => work && onLoadDiff(work)}
      >
        {t('loadDiff')}
      </button>
      {job && (
        <>
          <JobEvidence job={job} work={work} />
          <Badge state={job.state} />
        </>
      )}{' '}
      {result && <DiffView result={result} />}
    </article>
  );
}

export function Workspace({ snapshot }: { snapshot: Snapshot }) {
  const t = useT();
  const projectId = snapshot.project.id;
  const query = useWorkspaces(projectId);
  const diff = useLoadDiff(projectId, query.refetch);
  const data = query.data;
  return (
    <>
      <PageHeading title={t('workspace')} subtitle={t('workspaceHint')} />
      {snapshot.project.root && <GitGraph projectId={projectId} />}
      {snapshot.project.root && <GitHealth projectId={projectId} />}
      {diff.error && <p role="alert">{diff.error}</p>}
      {query.isPending ? (
        <p>{t('loading')}</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : !data?.workspaces.length ? (
        <Empty title={t('noWorkspaces')} hint={t('workspaceHint')} />
      ) : (
        data.workspaces.map((w) => (
          <WorkspaceCard
            key={w.id}
            workspace={w}
            work={snapshot.work.find((item) => item.id === w.workId)}
            job={data.jobs.find((j) => j.workspaceId === w.id && j.kind === 'diff')}
            busy={diff.busy}
            onLoadDiff={diff.load}
          />
        ))
      )}
      <Reservations projectId={projectId} />
    </>
  );
}
