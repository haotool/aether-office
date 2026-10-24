import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, ShieldQuestion, X } from 'lucide-react';
import type { PermissionDecisionInput, PermissionRequestView } from '@aether/contracts';
import { ApiError } from '../../lib/api/api-error.js';
import { api } from '../../lib/api/api.js';
import { useT, useWhy } from '../../ui/useT.js';
import type { Why } from '../../ui/whyNot.js';
import {
  mustReview,
  REQUESTS_KEY,
  requestsFor,
  secondsLeft,
  usePermissionRequests,
} from './permission-requests.js';

type PermissionCardProps = {
  request: PermissionRequestView;
  compact?: boolean;
};

function useDecide(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PermissionDecisionInput) =>
      api(`/api/permission-requests/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: REQUESTS_KEY }),
  });
}

const decideError = (error: unknown): string =>
  error instanceof ApiError ? error.code : 'REQUEST_FAILED';

function useSecondsLeft(expiresAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return secondsLeft(expiresAt, now);
}

/**
 * Nothing is ever allowed except by a press on a button. A compact card offers Allow only when its one line is the
 * whole call; otherwise it shows Review, so nobody allows what they have not read.
 */
export function PermissionCard({ request, compact = false }: PermissionCardProps) {
  const t = useT();
  const whyNot = useWhy();
  const decide = useDecide(request.id);
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const left = useSecondsLeft(request.expiresAt);
  const closed = left === 0;
  const total = Math.max(1, (request.expiresAt - request.createdAt) / 1000);
  const answer = (decision: Answer) =>
    decide.mutate({
      decision,
      ...(decision === 'deny' && message.trim() ? { message: message.trim() } : {}),
    });
  const disabled = closed || decide.isPending;
  const why = whyNot([!closed, 'whyNotDecidable'], [!decide.isPending, 'whyBusy']);
  const full = !compact || reviewed;
  const review = mustReview(request, compact, reviewed);
  return (
    <section className={`permission-card ${compact ? 'compact' : ''}`} aria-label={t('reqTitle')}>
      <i
        className="permission-progress"
        aria-hidden
        style={{ width: `${Math.min(100, (left / total) * 100)}%` }}
      />
      <header className="permission-head">
        <ShieldQuestion size={16} aria-hidden />
        <strong>{request.tool}</strong>
        <span className="permission-summary" title={request.summary}>
          {request.summary}
        </span>
        <time className="permission-left" aria-live="off">
          {closed ? t('reqTerminal') : `${t('reqCountdown')} ${left}s`}
        </time>
      </header>
      {full && <PermissionDetails request={request} message={message} onMessage={setMessage} />}
      <PermissionActions
        request={request}
        full={full}
        review={review}
        disabled={disabled}
        why={why}
        onReview={() => setReviewed(true)}
        onAnswer={answer}
      />
      {decide.isError && <DecideError error={decide.error} />}
    </section>
  );
}

function PermissionDetails({
  request,
  message,
  onMessage,
}: {
  request: PermissionRequestView;
  message: string;
  onMessage: (next: string) => void;
}) {
  const t = useT();
  return (
    <>
      {request.preview && (
        <pre className="permission-preview" tabIndex={0}>
          {request.preview}
        </pre>
      )}
      {request.sessionRules.length > 0 && (
        <p className="muted permission-rules">
          {`${t('reqSessionRules')} ${request.sessionRules.join(', ')}`}
        </p>
      )}
      <input
        className="permission-reason"
        value={message}
        maxLength={300}
        placeholder={t('reqReason')}
        aria-label={t('reqReason')}
        onChange={(e) => onMessage(e.target.value)}
      />
    </>
  );
}

type Answer = 'allow' | 'deny' | 'allow_session';

function PermissionActions({
  request,
  full,
  review,
  disabled,
  why,
  onReview,
  onAnswer,
}: {
  request: PermissionRequestView;
  full: boolean;
  review: boolean;
  disabled: boolean;
  why: Why;
  onReview: () => void;
  onAnswer: (decision: Answer) => void;
}) {
  const t = useT();
  return (
    <div className="permission-actions">
      <AllowButton
        review={review}
        disabled={disabled}
        why={why}
        onReview={onReview}
        onAllow={() => onAnswer('allow')}
      />
      {full && request.sessionRules.length > 0 && (
        <button
          className="secondary"
          disabled={disabled}
          {...why}
          onClick={() => onAnswer('allow_session')}
        >
          {t('reqAllowSession')}
        </button>
      )}
      <button
        className="secondary permission-deny"
        disabled={disabled}
        {...why}
        onClick={() => onAnswer('deny')}
      >
        <X size={16} aria-hidden />
        {t('reqDeny')}
      </button>
    </div>
  );
}

function AllowButton({
  review,
  disabled,
  why,
  onReview,
  onAllow,
}: {
  review: boolean;
  disabled: boolean;
  why: Why;
  onReview: () => void;
  onAllow: () => void;
}) {
  const t = useT();
  return review ? (
    <button className="primary" onClick={onReview}>
      <Eye size={16} aria-hidden />
      {t('reqReview')}
    </button>
  ) : (
    <button className="primary" disabled={disabled} {...why} onClick={onAllow}>
      <Check size={16} aria-hidden />
      {t('reqAllowOnce')}
    </button>
  );
}

function DecideError({ error }: { error: unknown }) {
  const t = useT();
  const code = decideError(error);
  return (
    <p className="permission-error" role="alert">
      {code === 'PERMISSION_REQUEST_CLOSED'
        ? t('reqTooLate')
        : code === 'REMOTE_APPROVALS_LAN_DISABLED'
          ? t('reqLanBlocked')
          : t('reqFailed')}
    </p>
  );
}

export function PermissionCards({
  sessionKey,
  compact = false,
}: {
  sessionKey: string;
  compact?: boolean;
}) {
  const mine = requestsFor(usePermissionRequests(), sessionKey);
  return (
    <>
      {mine.map((request) => (
        <PermissionCard key={request.id} request={request} compact={compact} />
      ))}
    </>
  );
}

export function PermissionPeek({ sessionKey }: { sessionKey?: string | undefined }) {
  const pending = usePermissionRequests().filter((r) => r.state === 'pending');
  const request =
    (sessionKey ? requestsFor(pending, sessionKey)[0] : undefined) ??
    [...pending].sort((a, b) => a.createdAt - b.createdAt)[0];
  return request ? (
    <div className="permission-peek">
      <PermissionCard request={request} compact />
    </div>
  ) : null;
}
