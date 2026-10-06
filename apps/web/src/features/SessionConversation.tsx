import type { ReactNode } from 'react';
import { Focus } from 'lucide-react';
import type { Agent, AttributedSession, Snapshot } from '@aether/contracts';
import { AvatarIcon, Badge, useT } from '../ui.js';
import { PermissionCards } from './PermissionCard.js';
import { requestsFor, usePermissionRequests } from './permission-requests.js';
import { SessionDetails } from './SessionDetails.js';
import { SessionFooter } from './SessionFooter.js';
import { TranscriptView } from './TranscriptView.js';

const contextPercent = (s: AttributedSession) =>
  s.usage.contextTokens !== null && s.usage.contextWindow
    ? Math.round((s.usage.contextTokens / s.usage.contextWindow) * 100)
    : null;

/**
 * The selected member as a conversation: who and in what state, then the transcript (newest at the bottom), then one
 * closed fold of details, then the foot (read-only actions, or a composer where AETHER can drive the session).
 */
export function SessionConversation({
  agent,
  session,
  snapshot,
  attention,
  composer,
  trailing,
  onBack,
  onFocus,
}: {
  agent: Agent;
  session: AttributedSession | null;
  snapshot: Snapshot;
  /** Sessions other than this one that want a look: shown on the way back to the feed. */
  attention: number;
  /** An input to use in place of the one the foot chooses for the session. */
  composer?: ReactNode;
  /** Buttons at the end of the header (close, or collapse to a peek on a phone). */
  trailing?: ReactNode;
  onBack: () => void;
  onFocus: () => void;
}) {
  const t = useT();
  const asking = !!session && requestsFor(usePermissionRequests(), session.key).length > 0;
  const percent = session ? contextPercent(session) : null;
  const branch = session?.git?.branch;
  const model = session?.usage.model;
  const title = session?.title ?? agent.name;
  const where = session ? [session.repo, branch].filter(Boolean).join(' · ') : agent.role;
  return (
    <div className="conversation">
      <header className="conv-header">
        <div className="conv-nav">
          <div className="panel-tabs" role="group" aria-label={t('panelTitle')}>
            <button className="back" aria-label={t('panelBack')} onClick={onBack}>
              {t('panelFeedTab')}
              {attention > 0 && <span className="count-badge">{attention}</span>}
            </button>
            <span className="selected" aria-current="page">
              {t('panelSessionTab')}
            </span>
          </div>
          <span className="conv-actions">
            <button
              className="icon-button"
              aria-label={t('focus')}
              title={t('focus')}
              onClick={onFocus}
            >
              <Focus size={17} />
            </button>
            {trailing}
          </span>
        </div>
        <div className="conv-identity">
          <AvatarIcon species={agent.species} color={agent.color} name={agent.name} size={32} />
          <div className="conv-title">
            <strong title={title}>{title}</strong>
            <small title={where}>{where}</small>
          </div>
          <Badge state={agent.activity} />
        </div>
        {(model || percent !== null) && (
          <div className="conv-meta">
            {model && (
              <span className="chip-meta" title={model}>
                {model}
              </span>
            )}
            {percent !== null && (
              <span className="ctx-text">{`${t('convContext')} ${percent}%`}</span>
            )}
          </div>
        )}
        {percent !== null && (
          <div
            className="ctx-meter"
            role="meter"
            aria-label={t('convContext')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(percent, 100)}
            aria-valuetext={`${t('convContext')} ${percent}%`}
            title={`${t('convContext')} ${percent}%`}
          >
            <i style={{ left: `${Math.min(percent, 100)}%` }} />
          </div>
        )}
      </header>
      {session && <PermissionCards sessionKey={session.key} />}
      {agent.activity === 'waiting_permission' && !asking && (
        <p className="conv-waiting" role="status">
          {t('convWaiting')}
        </p>
      )}
      {session ? (
        <TranscriptView
          key={session.key}
          sessionKey={session.key}
          working={agent.activity === 'working'}
        >
          <SessionDetails agent={agent} session={session} snapshot={snapshot} />
        </TranscriptView>
      ) : (
        <div className="conv-body">
          <div className="conv-scroll">
            <SessionDetails agent={agent} session={null} snapshot={snapshot} />
          </div>
        </div>
      )}
      <SessionFooter
        session={session}
        projectId={snapshot.project.id}
        working={agent.activity === 'working'}
        composer={composer}
      />
    </div>
  );
}
