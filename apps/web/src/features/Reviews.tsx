import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Snapshot } from '@aether/contracts';
import { api, execute } from '../api.js';
import { PageHeading, Empty, Badge, Field, useT, Clamp } from '../ui.js';
import { useWorkspaces, JobEvidence } from './Workspace.js';
import { HunkComments } from './HunkComments.js';
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const workspace = useWorkspaces(snapshot.project.id);
  const items = snapshot.work.filter((w) =>
    ['reviewing', 'changes_requested', 'verified'].includes(w.state),
  );
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onSaved();
      await workspace.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title={t('reviews')} subtitle={t('reviewNote')} />
      {items.length ? (
        <div className="review-list">
          {items.map((work) => {
            const w = workspace.data?.workspaces.find(
              (w) => w.workId === work.id && w.purpose === 'implementation',
            );
            const verifiers = w
              ? (JSON.parse(w.verifiers) as { name: string; sourceHash: string }[])
              : [];
            const job = workspace.data?.jobs.find(
              (j) => j.workId === work.id && j.kind === 'verify',
            );
            const result = job?.result
              ? (JSON.parse(job.result) as {
                  verification?: { status: string; harnessHash: string; logHash: string };
                  error?: string;
                })
              : null;
            return (
              <article className="panel" key={work.id}>
                <Badge state={work.state} />
                <h2>{work.title}</h2>
                <h4>{t('acceptance')}</h4>
                <p>{work.acceptance}</p>
                <Clamp className="result-text">{work.result}</Clamp>
                <code>{work.headSha ?? t('verificationRequired')}</code>
                {work.headSha && (
                  <HunkComments
                    projectId={snapshot.project.id}
                    work={work}
                    canComment={canReview}
                  />
                )}
                {snapshot.project.mode === 'live' && (
                  <NativeReview
                    work={work}
                    snapshot={snapshot}
                    canRequest={canRequestReview}
                    onSaved={onSaved}
                  />
                )}
                {work.state === 'reviewing' && !work.reviewBy && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      const submitter = (e.nativeEvent as SubmitEvent)
                        .submitter as HTMLButtonElement;
                      void perform(() =>
                        execute(
                          'work.review',
                          { workId: work.id, decision: submitter.value, body: data.get('body') },
                          snapshot.project.id,
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
                        disabled={!canReview || busy}
                      >
                        {t('requestChanges')}
                      </button>
                      <button
                        name="decision"
                        value="approve"
                        className="primary"
                        disabled={!canReview || busy}
                      >
                        {t('approve')}
                      </button>
                    </div>
                  </form>
                )}
                {work.state === 'reviewing' &&
                  work.reviewBy &&
                  canAccept &&
                  (verifiers.length ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void perform(() =>
                          execute(
                            'work.verify',
                            { workId: work.id, verifier: data.get('verifier') },
                            snapshot.project.id,
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
                      <button
                        disabled={busy || job?.state === 'queued' || job?.state === 'running'}
                      >
                        {t('runVerification')}
                      </button>
                    </form>
                  ) : (
                    <p>{t('noVerifier')}</p>
                  ))}
                {job && (
                  <>
                    <JobEvidence job={job} work={work} />
                    <Badge state={result?.verification?.status ?? job.state} />
                  </>
                )}{' '}
                {result?.error && <p role="alert">{result.error}</p>}
                {result?.verification && (
                  <details>
                    <summary>{t('details')}</summary>
                    <p className="path-label">Harness SHA-256: {result.verification.harnessHash}</p>
                    <p className="path-label">Log SHA-256: {result.verification.logHash}</p>
                  </details>
                )}
                {work.state === 'verified' && (
                  <button
                    className="primary"
                    disabled={!canAccept || busy}
                    onClick={() =>
                      void perform(() =>
                        execute(
                          'work.accept',
                          { workId: work.id },
                          snapshot.project.id,
                          work.version,
                        ),
                      )
                    }
                  >
                    {t('acceptWork')}
                  </button>
                )}
              </article>
            );
          })}
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

function NativeReview({
  work,
  snapshot,
  canRequest,
  onSaved,
}: {
  work: Snapshot['work'][number];
  snapshot: Snapshot;
  canRequest: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['review-runs', work.id, work.version],
    queryFn: () =>
      api<{
        runs: {
          id: string;
          agentId: string;
          provider: string;
          state: string;
          reviewHead: string;
          result: string | null;
        }[];
        reviews: { reviewerId: string; decision: string; body: string; headSha: string }[];
      }>(`/api/projects/${snapshot.project.id}/work/${work.id}/reviews`),
    refetchInterval: 2000,
  });
  const candidates = snapshot.agents.filter(
    (a) => a.id !== work.assignee && a.mode === 'live' && ['codex', 'claude'].includes(a.provider),
  );
  const active = query.data?.runs.some((r) =>
    ['queued', 'claimed', 'running', 'cancel_requested', 'indeterminate'].includes(r.state),
  );
  return (
    <section>
      <h3>{t('nativeReview')}</h3>
      <p className="muted">{t('nativeReviewHint')}</p>
      {work.state === 'reviewing' && !work.reviewBy && canRequest && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError('');
            try {
              await execute(
                'work.request_review',
                { workId: work.id, agentId: data.get('agentId') },
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
          <button disabled={busy || active || query.isPending || !candidates.length}>
            {t('startNativeReview')}
          </button>
        </form>
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
