import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Snapshot } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { Badge } from '../../ui/Badge.js';
import { Field } from '../../ui/Field.js';
import { useT, useWhy } from '../../ui/useT.js';
import type { Why } from '../../ui/whyNot.js';
import { POLL, poll } from '../../lib/app/polling.js';

type Work = Snapshot['work'][number];

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
  why: busyWhy,
  onSend,
}: {
  work: Work;
  snapshot: Snapshot;
  disabled: boolean;
  why: Why;
  onSend: (agentId: FormDataEntryValue | null) => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  const candidates = snapshot.agents.filter(
    (a) => a.id !== work.assignee && a.mode === 'live' && ['codex', 'claude'].includes(a.provider),
  );
  const why = disabled ? busyWhy : whyNot([candidates.length > 0, 'whyNoReviewer']);
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
      <button disabled={disabled || !candidates.length} {...why}>
        {t('startNativeReview')}
      </button>
    </form>
  );
}

/** The review runs started so far, and the reviews they produced. */
function ReviewOutcomes({ data, agents }: { data: ReviewRuns; agents: Snapshot['agents'] }) {
  return (
    <>
      {data.runs.map((run) => (
        <p key={run.id}>
          {agents.find((a) => a.id === run.agentId)?.name ?? run.agentId} ·{' '}
          <Badge state={run.state} /> · <code>{run.reviewHead.slice(0, 12)}</code>
        </p>
      ))}
      {data.reviews.map((review, i) => (
        <div key={i}>
          <Badge state={review.decision} />
          <p className="preserve-space">{review.body}</p>
          <code>{review.headSha}</code>
        </div>
      ))}
    </>
  );
}

type NativeReviewProps = {
  work: Work;
  snapshot: Snapshot;
  canRequest: boolean;
  onSaved: () => void;
};

export function NativeReview({ work, snapshot, canRequest, onSaved }: NativeReviewProps) {
  const t = useT();
  const whyNot = useWhy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['review-runs', work.id, work.version],
    queryFn: () => api<ReviewRuns>(`/api/projects/${snapshot.project.id}/work/${work.id}/reviews`),
    ...poll(POLL.watching),
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
          why={whyNot([!busy && !active && !query.isPending, 'whyBusy'])}
          onSend={(agentId) => void request(agentId)}
        />
      )}
      {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
      {query.data && <ReviewOutcomes data={query.data} agents={snapshot.agents} />}
    </section>
  );
}
