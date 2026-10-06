import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Focus } from 'lucide-react';
import { ProviderMark } from '@aether/office-scene/model';
import type { Agent, AttributedSession, Snapshot } from '@aether/contracts';
import { avatarState } from '../avatar/state.js';
import { labelOf } from '../localSessions.js';
import { SUBAGENT_INFIX, parentOf } from '../subagent-id.js';
import { Badge, useT } from '../ui.js';
import { Avatar } from './Avatar.js';
import { squadViewOf } from './feed-squads.js';
import { HookNote, needsHook } from './HookNote.js';
import { PermissionCards } from './PermissionCard.js';
import { requestsFor, usePermissionRequests } from './permission-requests.js';
import { SessionDetails } from './SessionDetails.js';
import { SessionFooter } from './SessionFooter.js';
import { SquadStrip } from './SquadStrip.js';
import { SubagentCards } from './SubagentCards.js';
import { SubagentFoot, SubagentView } from './SubagentView.js';
import { TranscriptView } from './TranscriptView.js';

const contextPercent = (s: AttributedSession) =>
  s.usage.contextPct === null ? null : Math.round(s.usage.contextPct);

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
  onOpen,
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
  /** Select a member: the supervisor of a subagent, from its "spawned by" link. */
  onOpen: (agentId: string) => void;
}) {
  const t = useT();
  const asking = !!session && requestsFor(usePermissionRequests(), session.key).length > 0;
  const percent = session ? contextPercent(session) : null;
  const branch = session?.git?.branch;
  const model = session?.usage.model;
  const isSub = agent.id.includes(SUBAGENT_INFIX);
  // The squad as it stands now; a subagent's own view and a supervisor's strip and cards both read it.
  const squad = useMemo(() => (session ? squadViewOf(session, Date.now()) : null), [session]);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [agent.id]);
  const supervisorId = parentOf(agent.id);
  const supervisor = session ? labelOf(session) : '';
  const title = isSub ? agent.name : (session?.title ?? agent.name);
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
          <Avatar
            seed={agent.id}
            species={agent.species}
            size="row"
            state={avatarState(agent.activity)}
            squadHue={squad?.hue}
            tether={isSub}
          />
          <div className="conv-title">
            <strong title={title}>
              {session && <ProviderMark provider={session.provider} />} {title}
            </strong>
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
        {!isSub && squad && <SquadStrip view={squad} picked={picked} onPick={setPicked} />}
      </header>
      {session && !isSub && !squad && needsHook(session, agent.activity === 'working') && (
        <HookNote session={session} />
      )}
      {session && <PermissionCards sessionKey={session.key} />}
      {agent.activity === 'waiting_permission' && !asking && (
        <p className="conv-waiting" role="status">
          {t('convWaiting')}
        </p>
      )}
      {session && isSub ? (
        <SubagentView
          row={squad?.rows.find((r) => r.id === agent.id) ?? null}
          session={session}
          supervisorLabel={supervisor}
          hue={squad?.hue ?? 0}
          onOpenSupervisor={() => onOpen(supervisorId)}
        />
      ) : session ? (
        <TranscriptView
          key={session.key}
          sessionKey={session.key}
          working={agent.activity === 'working'}
        >
          {squad && <SubagentCards view={squad} session={session} picked={picked} />}
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
        composer={isSub ? <SubagentFoot onOpenSupervisor={() => onOpen(supervisorId)} /> : composer}
      />
    </div>
  );
}
