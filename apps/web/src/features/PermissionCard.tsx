import { useEffect, useState } from 'react';
import { Check, Eye, ShieldQuestion, X } from 'lucide-react';
import type { PermissionRequestView } from '@aether/contracts';
import { useT } from '../ui.js';
import {
  decideError,
  mustReview,
  requestsFor,
  secondsLeft,
  useDecide,
  usePermissionRequests,
} from './permission-requests.js';

/** Counts down to the moment the hook gives up and Claude asks in the terminal. */
function useSecondsLeft(expiresAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return secondsLeft(expiresAt, now);
}

/**
 * One permission prompt of Claude Code, answerable here: what it wants to run (a redacted, bounded summary and
 * preview), Allow once, Allow for this session (only when Claude offered rules), and Deny with an optional reason.
 * Nothing is ever allowed except by a press on a button. `compact` is the feed row and the phone peek: the summary and
 * Deny; the full card also has the preview, the session option and the reason. A compact card offers Allow only when its
 * one line is the whole call: otherwise it shows Review, which opens the full card, so nobody allows what they have not read.
 */
export function PermissionCard({
  request,
  compact = false,
}: {
  request: PermissionRequestView;
  compact?: boolean;
}) {
  const t = useT();
  const decide = useDecide(request.id);
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const left = useSecondsLeft(request.expiresAt);
  const closed = left === 0;
  const total = Math.max(1, (request.expiresAt - request.createdAt) / 1000);
  const answer = (decision: 'allow' | 'deny' | 'allow_session') =>
    decide.mutate({
      decision,
      ...(decision === 'deny' && message.trim() ? { message: message.trim() } : {}),
    });
  const disabled = closed || decide.isPending;
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
      {full && request.preview && (
        <pre className="permission-preview" tabIndex={0}>
          {request.preview}
        </pre>
      )}
      {full && request.sessionRules.length > 0 && (
        <p className="muted permission-rules">
          {`${t('reqSessionRules')} ${request.sessionRules.join(', ')}`}
        </p>
      )}
      {full && (
        <input
          className="permission-reason"
          value={message}
          maxLength={300}
          placeholder={t('reqReason')}
          aria-label={t('reqReason')}
          onChange={(e) => setMessage(e.target.value)}
        />
      )}
      <div className="permission-actions">
        {review ? (
          <button className="primary" onClick={() => setReviewed(true)}>
            <Eye size={16} aria-hidden />
            {t('reqReview')}
          </button>
        ) : (
          <button className="primary" disabled={disabled} onClick={() => answer('allow')}>
            <Check size={16} aria-hidden />
            {t('reqAllowOnce')}
          </button>
        )}
        {full && request.sessionRules.length > 0 && (
          <button className="secondary" disabled={disabled} onClick={() => answer('allow_session')}>
            {t('reqAllowSession')}
          </button>
        )}
        <button
          className="secondary permission-deny"
          disabled={disabled}
          onClick={() => answer('deny')}
        >
          <X size={16} aria-hidden />
          {t('reqDeny')}
        </button>
      </div>
      {decide.isError && (
        <p className="permission-error" role="alert">
          {decideError(decide.error) === 'PERMISSION_REQUEST_CLOSED'
            ? t('reqTooLate')
            : decideError(decide.error) === 'REMOTE_APPROVALS_LAN_DISABLED'
              ? t('reqLanBlocked')
              : t('reqFailed')}
        </p>
      )}
    </section>
  );
}

/** The pending cards of one session (nothing when it has none), for the feed row and the top of the conversation. */
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

/** A phone's sheet at its peek height: the prompt that most wants an answer (the member's own, else the oldest) over the bar. */
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
