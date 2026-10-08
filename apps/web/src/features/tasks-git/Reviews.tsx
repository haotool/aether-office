import { useState } from 'react';
import type { Snapshot } from '@aether/contracts';
import { execute } from '../../lib/api/api-commands.js';
import { PageHeading } from '../../ui/PageHeading.js';
import { Empty } from '../../ui/Empty.js';
import { Badge } from '../../ui/Badge.js';
import { Field } from '../../ui/Field.js';
import { useT, useWhy } from '../../ui/useT.js';
import type { Why } from '../../ui/whyNot.js';
import { Clamp } from '../../ui/Disclosure.js';
import { useWorkspaces, JobEvidence } from '../integrations/Workspace.js';
import { HunkComments } from './HunkComments.js';
import { NativeReview } from './NativeReview.js';
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
  why,
  perform,
}: {
  work: Work;
  projectId: string;
  disabled: boolean;
  why: Why;
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
        <button
          name="decision"
          value="changes_requested"
          className="secondary"
          disabled={disabled}
          {...why}
        >
          {t('requestChanges')}
        </button>
        <button name="decision" value="approve" className="primary" disabled={disabled} {...why}>
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
  why,
  perform,
}: {
  work: Work;
  projectId: string;
  verifiers: Verifier[];
  disabled: boolean;
  why: Why;
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
      <button disabled={disabled} {...why}>
        {t('runVerification')}
      </button>
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

/** What the reviewer can do at this state: decide, or run a verifier. */
function ReviewForms({
  work,
  projectId,
  can,
  busy,
  verifying,
  verifiers,
  perform,
}: {
  work: Work;
  projectId: string;
  can: Permissions;
  busy: boolean;
  verifying: boolean;
  /** The workspace's verifiers as the server sent them; read only when the verify form is drawn. */
  verifiers: string | undefined;
  perform: Perform;
}) {
  const whyNot = useWhy();
  return (
    <>
      {work.state === 'reviewing' && !work.reviewBy && (
        <DecisionForm
          work={work}
          projectId={projectId}
          disabled={!can.canReview || busy}
          why={whyNot([can.canReview, 'needOperator'], [!busy, 'whyBusy'])}
          perform={perform}
        />
      )}
      {work.state === 'reviewing' && work.reviewBy && can.canAccept && (
        <VerifyForm
          work={work}
          projectId={projectId}
          verifiers={parseVerifiers(verifiers)}
          disabled={busy || verifying}
          why={whyNot([!busy && !verifying, 'whyBusy'])}
          perform={perform}
        />
      )}
    </>
  );
}

function AcceptButton({
  work,
  projectId,
  can,
  busy,
  perform,
}: {
  work: Work;
  projectId: string;
  can: Permissions;
  busy: boolean;
  perform: Perform;
}) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <button
      className="primary"
      disabled={!can.canAccept || busy}
      {...whyNot([can.canAccept, 'needOperator'], [!busy, 'whyBusy'])}
      onClick={() =>
        void perform(() => execute('work.accept', { workId: work.id }, projectId, work.version))
      }
    >
      {t('acceptWork')}
    </button>
  );
}

type ReviewCardProps = {
  work: Work;
  snapshot: Snapshot;
  workspaces: WorkspaceData | undefined;
  can: Permissions;
  busy: boolean;
  perform: Perform;
  onSaved: () => void;
};

function ReviewCard({ work, snapshot, workspaces, can, busy, perform, onSaved }: ReviewCardProps) {
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
      <ReviewForms
        work={work}
        projectId={projectId}
        can={can}
        busy={busy}
        verifying={verifying}
        verifiers={workspace?.verifiers}
        perform={perform}
      />
      <VerifyEvidence job={job} work={work} outcome={parseVerifyOutcome(job?.result)} />
      {work.state === 'verified' && (
        <AcceptButton work={work} projectId={projectId} can={can} busy={busy} perform={perform} />
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
