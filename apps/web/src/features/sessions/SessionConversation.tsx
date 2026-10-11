import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Focus } from 'lucide-react';
import { ProviderMark } from '@aether/office-scene/model';
import type { Agent, AttributedSession, Snapshot } from '@aether/contracts';
import { avatarState } from '../../avatar/state.js';
import { labelOf } from '../../lib/sessions/session-names.js';
import { SUBAGENT_INFIX, parentOf } from '../../lib/sessions/subagent-id.js';
import { Badge } from '../../ui/Badge.js';
import { useT, useLocale } from '../../ui/useT.js';
import { Avatar } from '../office/Avatar.js';
import { contextLabel } from './context-label.js';
import { squadViewOf } from '../feed/feed-squads.js';
import { HookNote, needsHook } from '../shell-chrome/HookNote.js';
import { PermissionCards } from '../operations/PermissionCard.js';
import { RecentMoments } from '../feed/RecentMoments.js';
import { requestsFor, usePermissionRequests } from '../operations/permission-requests.js';
import { SessionDetails } from './SessionDetails.js';
import { SessionFooter } from './SessionFooter.js';
import { SquadStrip } from '../squad/SquadStrip.js';
import { SubagentCards } from './SubagentCards.js';
import { SubagentFoot, SubagentView } from './SubagentView.js';
import { TranscriptView } from '../conversation/TranscriptView.js';

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

type SessionConversationProps = {
  agent: Agent;
  session: AttributedSession | null;
  snapshot: Snapshot;
  attention: number;
  composer?: ReactNode;
  trailing?: ReactNode;
  onBack: () => void;
  onFocus: () => void;
  onOpen: (agentId: string) => void;
};

function ConvContext({ session }: { session: AttributedSession | null }) {
  const t = useT();
  const locale = useLocale();
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
  const locale = useLocale();
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

function ConvNotices({
  session,
  agent,
  isSub,
  squad,
  asking,
}: {
  session: AttributedSession | null;
  agent: Agent;
  isSub: boolean;
  squad: Squad;
  asking: boolean;
}) {
  const t = useT();
  return (
    <>
      {session && !isSub && !squad && needsHook(session, agent.activity === 'working') && (
        <HookNote session={session} />
      )}
      {session && <PermissionCards sessionKey={session.key} />}
      {agent.activity === 'waiting_permission' && !asking && (
        <p className="conv-waiting" role="status">
          {t('convWaiting')}
        </p>
      )}
    </>
  );
}

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
}: SessionConversationProps) {
  const asking = !!session && requestsFor(usePermissionRequests(), session.key).length > 0;
  const isSub = agent.id.includes(SUBAGENT_INFIX);
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
      <ConvNotices session={session} agent={agent} isSub={isSub} squad={squad} asking={asking} />
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
