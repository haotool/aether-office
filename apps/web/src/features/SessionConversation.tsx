import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Focus } from 'lucide-react';
import { ProviderMark } from '@aether/office-scene/model';
import type { Agent, AttributedSession, Snapshot } from '@aether/contracts';
import { avatarState } from '../avatar/state.js';
import { labelOf } from '../localSessions.js';
import { usePreferences } from '../state.js';
import { SUBAGENT_INFIX, parentOf } from '../subagent-id.js';
import { Badge, useT } from '../ui.js';
import { Avatar } from './Avatar.js';
import { contextLabel } from './context-label.js';
import { squadViewOf } from './feed-squads.js';
import { HookNote, needsHook } from './HookNote.js';
import { PermissionCards } from './PermissionCard.js';
import { RecentMoments } from './RecentMoments.js';
import { requestsFor, usePermissionRequests } from './permission-requests.js';
import { SessionDetails } from './SessionDetails.js';
import { SessionFooter } from './SessionFooter.js';
import { SquadStrip } from './SquadStrip.js';
import { SubagentCards } from './SubagentCards.js';
import { SubagentFoot, SubagentView } from './SubagentView.js';
import { TranscriptView } from './TranscriptView.js';

const contextPercent = (s: AttributedSession) =>
  s.usage.contextPct === null ? null : Math.round(s.usage.contextPct);

type Squad = ReturnType<typeof squadViewOf> | null;

function ConvNav({
  attention,
  trailing,
  onBack,
  onFocus,
}: {
  attention: number;
  trailing: ReactNode;
  onBack: () => void;
  onFocus: () => void;
}) {
  const t = useT();
  return (
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
  );
}

function ConvIdentity({
  agent,
  session,
  squad,
  isSub,
}: {
  agent: Agent;
  session: AttributedSession | null;
  squad: Squad;
  isSub: boolean;
}) {
  const title = isSub ? agent.name : (session?.title ?? agent.name);
  const where = session
    ? [session.repo, session.git?.branch].filter(Boolean).join(' · ')
    : agent.role;
  return (
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
  );
}

/** The model chip, the context percentage and the thin meter under it. */
function ConvContext({ session }: { session: AttributedSession | null }) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const percent = session ? contextPercent(session) : null;
  const contextText = session ? contextLabel(session.usage, t, locale) : null;
  const model = session?.usage.model;
  return (
    <>
      {(model || percent !== null) && (
        <div className="conv-meta">
          {model && (
            <span className="chip-meta" title={model}>
              {model}
            </span>
          )}
          {percent !== null && (
            <span className="ctx-text" title={contextText ?? undefined}>
              {`${t('convContext')} ${percent}%`}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function ContextMeter({ session }: { session: AttributedSession | null }) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const percent = session ? contextPercent(session) : null;
  if (percent === null || !session) return null;
  const contextText = contextLabel(session.usage, t, locale);
  return (
    <div
      className="ctx-meter"
      role="meter"
      aria-label={t('convContext')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
      aria-valuetext={contextText ?? undefined}
      title={contextText ?? undefined}
    >
      <i style={{ left: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

/** What the middle of the conversation shows: a subagent's own view, the transcript, or just the details. */
function ConvMain({
  agent,
  session,
  snapshot,
  squad,
  isSub,
  picked,
  onOpen,
}: {
  agent: Agent;
  session: AttributedSession | null;
  snapshot: Snapshot;
  squad: Squad;
  isSub: boolean;
  picked: string | null;
  onOpen: (agentId: string) => void;
}) {
  if (!session)
    return (
      <div className="conv-body">
        <div className="conv-scroll">
          <SessionDetails agent={agent} session={null} snapshot={snapshot} />
        </div>
      </div>
    );
  if (isSub)
    return (
      <SubagentView
        row={squad?.rows.find((r) => r.id === agent.id) ?? null}
        session={session}
        supervisorLabel={labelOf(session)}
        hue={squad?.hue ?? 0}
        onOpenSupervisor={() => onOpen(parentOf(agent.id))}
      />
    );
  return (
    <TranscriptView
      key={session.key}
      sessionKey={session.key}
      working={agent.activity === 'working'}
    >
      {squad && <SubagentCards view={squad} session={session} picked={picked} />}
      <SessionDetails agent={agent} session={session} snapshot={snapshot} />
    </TranscriptView>
  );
}

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
  const isSub = agent.id.includes(SUBAGENT_INFIX);
  // The squad as it stands now; a subagent's own view and a supervisor's strip and cards both read it.
  const squad = useMemo(() => (session ? squadViewOf(session, Date.now()) : null), [session]);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [agent.id]);
  return (
    <div className="conversation">
      <header className="conv-header">
        <ConvNav attention={attention} trailing={trailing} onBack={onBack} onFocus={onFocus} />
        <ConvIdentity agent={agent} session={session} squad={squad} isSub={isSub} />
        <ConvContext session={session} />
        <RecentMoments member={agent.id} />
        <ContextMeter session={session} />
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
      <ConvMain
        agent={agent}
        session={session}
        snapshot={snapshot}
        squad={squad}
        isSub={isSub}
        picked={picked}
        onOpen={onOpen}
      />
      <SessionFooter
        session={session}
        projectId={snapshot.project.id}
        working={agent.activity === 'working'}
        composer={
          isSub ? <SubagentFoot onOpenSupervisor={() => onOpen(parentOf(agent.id))} /> : composer
        }
      />
    </div>
  );
}
