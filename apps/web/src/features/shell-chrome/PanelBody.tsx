import type { ReactNode } from 'react';
import type { Agent, AttributedSession, Snapshot } from '@aether/contracts';
import { useT } from '../../ui/useT.js';
import { attentionCount, feedItems, type Feed } from '../feed/feed-model.js';
import { SessionConversation } from '../sessions/SessionConversation.js';
import { SessionFeed } from '../sessions/SessionFeed.js';

export type PanelProps = {
  agent: Agent | null;
  session: AttributedSession | null;
  snapshot: Snapshot;
  feed: Feed;
  onOpen: (agentId: string) => void;
  onBack: () => void;
  onFocus: () => void;
  trailing?: ReactNode;
};

export function PanelBody({
  agent,
  session,
  snapshot,
  feed,
  onOpen,
  onBack,
  onFocus,
  trailing,
}: PanelProps) {
  const t = useT();
  if (agent)
    return (
      <SessionConversation
        agent={agent}
        session={session}
        snapshot={snapshot}
        attention={attentionCount({
          ...feed,
          needs: feed.needs.filter((i) => i.agent.id !== agent.id),
          finished: feed.finished.filter((i) => i.agent.id !== agent.id),
        })}
        trailing={trailing}
        onBack={onBack}
        onFocus={onFocus}
        onOpen={onOpen}
      />
    );
  const count = attentionCount(feed);
  return (
    <div className="panel-feed">
      <header className="panel-head">
        <h2>{t('panelTitle')}</h2>
        <span className="feed-count">{feedItems(feed).length}</span>
        {count > 0 && <span className="count-badge">{`${count} ${t('feedUnread')}`}</span>}
        {trailing}
      </header>
      <div className="panel-scroll">
        <SessionFeed feed={feed} onOpen={onOpen} />
      </div>
    </div>
  );
}
