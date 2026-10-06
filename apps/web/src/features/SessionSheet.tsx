import { ChevronDown, ChevronUp, Focus, X } from 'lucide-react';
import { AvatarIcon, Badge, useT } from '../ui.js';
import { attentionCount, feedItems, mostUrgent, type Feed, type FeedItem } from './feed-model.js';
import { PermissionPeek } from './PermissionCard.js';
import { PanelBody, type PanelProps } from './SessionPanel.js';

/** The three heights of the phone's sheet: a 72px peek over the tab bar, the feed, the conversation. */
export type SheetHeight = 'peek' | 'half' | 'full';

const CHIPS = 12;

/** Who is in hand: avatar, name and their newest reply line, focus, open, close. */
function MemberPeek({
  agent,
  item,
  onOpen,
  onFocus,
  onClose,
}: {
  agent: PanelProps['agent'] & object;
  item: FeedItem | undefined;
  onOpen: () => void;
  onFocus: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="member-bar" role="region" aria-label={agent.name}>
      <button className="peek-open" onClick={onOpen}>
        <span className={`peek-avatar bucket-${item?.bucket ?? 'idle'}`}>
          <AvatarIcon species={agent.species} color={agent.color} name={agent.name} size={40} />
          <i className="state-dot" />
        </span>
        <span className="member-bar-text">
          <strong>{item?.label ?? agent.name}</strong>
          <small>{item?.reply ?? item?.where ?? agent.role}</small>
        </span>
        <Badge state={agent.activity} />
      </button>
      <button className="icon-button" aria-label={t('focus')} onClick={onFocus}>
        <Focus size={20} />
      </button>
      <button className="icon-button" aria-label={t('panelOpenConversation')} onClick={onOpen}>
        <ChevronUp size={22} />
      </button>
      <button className="icon-button" aria-label={t('close')} onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}

/** Nothing chosen: a chip for every session that wants a look, and the newest reply of the one that wants it most. */
function FeedPeek({
  feed,
  onChip,
  onOpen,
}: {
  feed: Feed;
  onChip: (agentId: string) => void;
  onOpen: () => void;
}) {
  const t = useT();
  const live = feedItems(feed)
    .filter((i) => i.bucket !== 'idle')
    .slice(0, CHIPS);
  const top = mostUrgent(feed);
  const count = attentionCount(feed);
  return (
    <div className="member-bar feed-peek" role="region" aria-label={t('panelTitle')}>
      <div className="peek-top">
        <div className="peek-chips">
          {live.map((item) => (
            <button
              key={item.key}
              className={`sheet-chip bucket-${item.bucket}`}
              aria-label={item.label}
              onClick={() => onChip(item.agent.id)}
            >
              <AvatarIcon species={item.agent.species} color={item.agent.color} name="" size={28} />
              <i className="state-dot" />
              {item.unread && <i className="unread-dot" />}
            </button>
          ))}
        </div>
        {count > 0 && <span className="count-badge">{count}</span>}
        <button className="icon-button" aria-label={t('panelOpenFeed')} onClick={onOpen}>
          <ChevronUp size={22} />
        </button>
      </div>
      <p className={`peek-line ${top?.reply ? '' : 'none'}`}>
        {top ? (top.reply ?? t('feedNoReply')) : t('feedEmptyTitle')}
      </p>
    </div>
  );
}

/** The panel on a phone: a sheet over the tab bar at one of three heights. */
export function SessionSheet({
  height,
  onHeight,
  ...props
}: Omit<PanelProps, 'trailing'> & {
  height: SheetHeight;
  onHeight: (height: SheetHeight) => void;
}) {
  const t = useT();
  const { agent, feed } = props;
  if (height === 'peek') {
    const item = agent ? feedItems(feed).find((i) => i.agent.id === agent.id) : undefined;
    return (
      <>
        <PermissionPeek sessionKey={item?.key} />
        {agent ? (
          <MemberPeek
            agent={agent}
            item={item}
            onOpen={() => onHeight('full')}
            onFocus={props.onFocus}
            onClose={props.onBack}
          />
        ) : (
          <FeedPeek feed={feed} onChip={props.onOpen} onOpen={() => onHeight('half')} />
        )}
      </>
    );
  }
  return (
    <section className={`session-sheet ${height}`} aria-label={t('panelTitle')}>
      <PanelBody
        {...props}
        onOpen={(id) => {
          props.onOpen(id);
          onHeight('full');
        }}
        onBack={() => {
          props.onBack();
          onHeight('half');
        }}
        trailing={
          <button
            className="icon-button"
            aria-label={t('collapse')}
            onClick={() => onHeight('peek')}
          >
            <ChevronDown size={22} />
          </button>
        }
      />
    </section>
  );
}
