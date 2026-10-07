import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Snapshot } from '@aether/contracts';
import { api, execute } from '../api.js';
import { PageHeading, Empty, Badge, Field, useT, Clamp } from '../ui.js';
import { useWorkspaces, JobEvidence } from './Workspace.js';
import { HunkComments } from './HunkComments.js';
import {
  parseVerifiers,
  parseVerifyOutcome,
  type Verifier,
  type VerifyOutcome,
} from './review-model.js';

type Work = Snapshot['work'][number];
type WorkspaceData = NonNullable<ReturnType<typeof useWorkspaces>['data']>;
type Perform = (fn: () => Promise<unknown>) => Promise<void>;

/** Runs one review command, then refreshes the snapshot and the workspaces; keeps the last error and busy flag. */
function useReviewActions(onSaved: () => void, refetch: () => Promise<unknown>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const perform: Perform = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onSaved();
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, perform };
}

function DecisionForm({
  work,
  projectId,
  disabled,
  perform,
}: {
  work: Work;
  projectId: string;
  disabled: boolean;
  perform: Perform;
}) {
  const t = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
        void perform(() =>
          execute(
            'work.review',
            { workId: work.id, decision: submitter.value, body: data.get('body') },
            projectId,
            work.version,
          ),
        );
      }}
    >
      <Field label={t('reviewBody')}>
        <textarea required name="body" rows={3} />
      </Field>
      <div className="form-actions">
        <button name="decision" value="changes_requested" className="secondary" disabled={disabled}>
          {t('requestChanges')}
        </button>
        <button name="decision" value="approve" className="primary" disabled={disabled}>
          {t('approve')}
        </button>
      </div>
    </form>
  );
}

function VerifyForm({
  work,
  projectId,
  verifiers,
  disabled,
  perform,
}: {
  work: Work;
  projectId: string;
  verifiers: Verifier[];
  disabled: boolean;
  perform: Perform;
}) {
  const t = useT();
  if (!verifiers.length) return <p>{t('noVerifier')}</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void perform(() =>
          execute(
            'work.verify',
            { workId: work.id, verifier: data.get('verifier') },
            projectId,
            work.version,
          ),
        );
      }}
    >
      <Field label={t('verifier')}>
        <select name="verifier">
          {verifiers.map((v) => (
            <option value={v.name} key={v.name}>
              {v.name} · {v.sourceHash.slice(0, 12)}
            </option>
          ))}
        </select>
      </Field>
      <button disabled={disabled}>{t('runVerification')}</button>
    </form>
  );
}

function VerifyEvidence({
  job,
  work,
  outcome,
}: {
  job: WorkspaceData['jobs'][number] | undefined;
  work: Work;
  outcome: VerifyOutcome | null;
}) {
  const t = useT();
  return (
    <>
      {job && (
        <>
          <JobEvidence job={job} work={work} />
          <Badge state={outcome?.verification?.status ?? job.state} />
        </>
      )}{' '}
      {outcome?.error && <p role="alert">{outcome.error}</p>}
      {outcome?.verification && (
        <details>
          <summary>{t('details')}</summary>
          <p className="path-label">Harness SHA-256: {outcome.verification.harnessHash}</p>
          <p className="path-label">Log SHA-256: {outcome.verification.logHash}</p>
        </details>
      )}
    </>
  );
}

type Permissions = { canReview: boolean; canAccept: boolean; canRequestReview: boolean };

function ReviewCard({
  work,
  snapshot,
  workspaces,
  can,
  busy,
  perform,
  onSaved,
}: {
  work: Work;
  snapshot: Snapshot;
  workspaces: WorkspaceData | undefined;
  can: Permissions;
  busy: boolean;
  perform: Perform;
  onSaved: () => void;
}) {
  const t = useT();
  const projectId = snapshot.project.id;
  const workspace = workspaces?.workspaces.find(
    (w) => w.workId === work.id && w.purpose === 'implementation',
  );
  const job = workspaces?.jobs.find((j) => j.workId === work.id && j.kind === 'verify');
  const verifying = job?.state === 'queued' || job?.state === 'running';
  return (
    <article className="panel">
      <Badge state={work.state} />
      <h2>{work.title}</h2>
      <h4>{t('acceptance')}</h4>
      <p>{work.acceptance}</p>
      <Clamp className="result-text">{work.result}</Clamp>
      <code>{work.headSha ?? t('verificationRequired')}</code>
      {work.headSha && (
        <HunkComments projectId={projectId} work={work} canComment={can.canReview} />
      )}
      {snapshot.project.mode === 'live' && (
        <NativeReview
          work={work}
          snapshot={snapshot}
          canRequest={can.canRequestReview}
          onSaved={onSaved}
        />
      )}
      {work.state === 'reviewing' && !work.reviewBy && (
        <DecisionForm
          work={work}
          projectId={projectId}
          disabled={!can.canReview || busy}
          perform={perform}
        />
      )}
      {work.state === 'reviewing' && work.reviewBy && can.canAccept && (
        <VerifyForm
          work={work}
          projectId={projectId}
          verifiers={parseVerifiers(workspace?.verifiers)}
          disabled={busy || verifying}
          perform={perform}
        />
      )}
      <VerifyEvidence job={job} work={work} outcome={parseVerifyOutcome(job?.result)} />
      {work.state === 'verified' && (
        <button
          className="primary"
          disabled={!can.canAccept || busy}
          onClick={() =>
            void perform(() => execute('work.accept', { workId: work.id }, projectId, work.version))
          }
        >
          {t('acceptWork')}
        </button>
      )}
    </article>
  );
}

export function Reviews({
  snapshot,
  onSaved,
  canReview,
  canAccept,
  canRequestReview,
}: {
  snapshot: Snapshot;
  onSaved: () => void;
  canReview: boolean;
  canAccept: boolean;
  canRequestReview: boolean;
}) {
  const t = useT();
  const workspace = useWorkspaces(snapshot.project.id);
  const { error, busy, perform } = useReviewActions(onSaved, workspace.refetch);
  const items = snapshot.work.filter((w) =>
    ['reviewing', 'changes_requested', 'verified'].includes(w.state),
  );
  return (
    <>
      <PageHeading title={t('reviews')} subtitle={t('reviewNote')} />
      {items.length ? (
        <div className="review-list">
          {items.map((work) => (
            <ReviewCard
              key={work.id}
              work={work}
              snapshot={snapshot}
              workspaces={workspace.data}
              can={{ canReview, canAccept, canRequestReview }}
              busy={busy}
              perform={perform}
              onSaved={onSaved}
            />
          ))}
        </div>
      ) : (
        <Empty title={t('noReviews')} hint={t('reviewNote')} />
      )}{' '}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

type ReviewRuns = {
  runs: {
    id: string;
    agentId: string;
    provider: string;
    state: string;
    reviewHead: string;
    result: string | null;
  }[];
  reviews: { reviewerId: string; decision: string; body: string; headSha: string }[];
};

const ACTIVE_RUN_STATES = ['queued', 'claimed', 'running', 'cancel_requested', 'indeterminate'];

function RequestReviewForm({
  work,
  snapshot,
  disabled,
  onSend,
}: {
  work: Work;
  snapshot: Snapshot;
  disabled: boolean;
  onSend: (agentId: FormDataEntryValue | null) => void;
}) {
  const t = useT();
  const candidates = snapshot.agents.filter(
    (a) => a.id !== work.assignee && a.mode === 'live' && ['codex', 'claude'].includes(a.provider),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend(new FormData(e.currentTarget).get('agentId'));
      }}
    >
      <Field label={t('reviewAgent')}>
        <select required name="agentId">
          {candidates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.provider}
            </option>
          ))}
        </select>
      </Field>
      <button disabled={disabled || !candidates.length}>{t('startNativeReview')}</button>
    </form>
  );
}

function NativeReview({
  work,
  snapshot,
  canRequest,
  onSaved,
}: {
  work: Work;
  snapshot: Snapshot;
  canRequest: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['review-runs', work.id, work.version],
    queryFn: () => api<ReviewRuns>(`/api/projects/${snapshot.project.id}/work/${work.id}/reviews`),
    refetchInterval: 2000,
  });
  const active = query.data?.runs.some((r) => ACTIVE_RUN_STATES.includes(r.state));
  const request = async (agentId: FormDataEntryValue | null) => {
    setBusy(true);
    setError('');
    try {
      await execute(
        'work.request_review',
        { workId: work.id, agentId },
        snapshot.project.id,
        work.version,
      );
      onSaved();
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h3>{t('nativeReview')}</h3>
      <p className="muted">{t('nativeReviewHint')}</p>
      {work.state === 'reviewing' && !work.reviewBy && canRequest && (
        <RequestReviewForm
          work={work}
          snapshot={snapshot}
          disabled={busy || !!active || query.isPending}
          onSend={(agentId) => void request(agentId)}
        />
      )}
      {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
      {query.data?.runs.map((run) => (
        <p key={run.id}>
          {snapshot.agents.find((a) => a.id === run.agentId)?.name ?? run.agentId} ·{' '}
          <Badge state={run.state} /> · <code>{run.reviewHead.slice(0, 12)}</code>
        </p>
      ))}
      {query.data?.reviews.map((review, i) => (
        <div key={i}>
          <Badge state={review.decision} />
          <p className="preserve-space">{review.body}</p>
          <code>{review.headSha}</code>
        </div>
      ))}
    </section>
  );
}
