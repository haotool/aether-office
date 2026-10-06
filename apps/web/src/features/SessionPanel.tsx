import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import type { Agent, AttributedSession, Snapshot } from '@aether/contracts';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { attentionCount, feedItems, type Feed } from './feed-model.js';
import { PanelResizer } from './PanelResizer.js';
import { usePanelLayout } from './use-panel-layout.js';
import { SessionConversation } from './SessionConversation.js';
import { SessionFeed } from './SessionFeed.js';

export type PanelProps = {
  /** The chosen member; none shows the feed. */
  agent: Agent | null;
  session: AttributedSession | null;
  snapshot: Snapshot;
  feed: Feed;
  /** Choosing a row of the feed (selects the member; the camera follows, as with a click in the scene). */
  onOpen: (agentId: string) => void;
  onBack: () => void;
  onFocus: () => void;
  /** Buttons at the end of the header: close on a desktop, collapse on a phone. */
  trailing?: ReactNode;
};

/** What the panel shows: the feed, or the chosen member's conversation. Shared by the desktop column and the phone sheet. */
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

/** The collapsed panel: a column of 48px with the way back in and what wants a look (needs you, unread). */
function PanelRail({ feed, onExpand }: { feed: Feed; onExpand: () => void }) {
  const t = useT();
  const needs = feed.needs.length;
  const unread = attentionCount(feed) - needs;
  return (
    <div className="panel-rail">
      <button className="icon-button" aria-label={t('panelExpand')} onClick={onExpand}>
        <PanelRightOpen size={17} />
      </button>
      {needs > 0 && (
        <span
          className="count-badge"
          title={t('feedNeeds')}
          aria-label={`${needs} ${t('feedNeeds')}`}
        >
          {needs}
        </span>
      )}
      {unread > 0 && (
        <span
          className="count-badge unread"
          title={t('feedUnread')}
          aria-label={`${unread} ${t('feedUnread')}`}
        >
          {unread}
        </span>
      )}
    </div>
  );
}

/**
 * The desktop panel: a column beside the office, always there, a feed until a member is chosen. Its width is the
 * `--panel-w` variable of the app body (set here, and by the drag handle while dragging); narrow windows lay it over the
 * office at a fixed width, and it can fold to a rail.
 */
export function SessionPanel(props: Omit<PanelProps, 'trailing'> & { onClose: () => void }) {
  const t = useT();
  const { onClose, feed, ...body } = props;
  const layout = usePanelLayout();
  const still = usePreferences((s) => s.reducedMotion);
  const aside = useRef<HTMLElement>(null);
  const { occupied } = layout;
  useLayoutEffect(() => {
    const host = aside.current?.parentElement;
    host?.style.setProperty('--panel-w', `${occupied}px`);
    return () => {
      host?.style.removeProperty('--panel-w');
    };
  }, [occupied]);
  return (
    <aside
      ref={aside}
      className={`session-panel ${layout.collapsed ? 'rail' : ''} ${still ? 'still' : ''}`}
      aria-label={t('panelTitle')}
    >
      {layout.resizable && !layout.collapsed && (
        <PanelResizer
          width={layout.width}
          viewport={layout.viewport}
          onCommit={layout.setWidth}
          onCollapse={() => layout.setCollapsed(true)}
        />
      )}
      {layout.collapsed ? (
        <PanelRail feed={feed} onExpand={() => layout.setCollapsed(false)} />
      ) : (
        <PanelBody
          {...body}
          feed={feed}
          trailing={
            <>
              {layout.resizable && (
                <button
                  className="icon-button"
                  aria-label={t('panelCollapse')}
                  title={t('panelCollapse')}
                  onClick={() => layout.setCollapsed(true)}
                >
                  <PanelRightClose size={17} />
                </button>
              )}
              <button
                className="icon-button"
                aria-label={t('close')}
                title={t('close')}
                onClick={onClose}
              >
                <X size={17} />
              </button>
            </>
          }
        />
      )}
    </aside>
  );
}
