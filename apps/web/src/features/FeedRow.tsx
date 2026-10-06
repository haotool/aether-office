import { memo, type ReactNode } from 'react';
import { ProviderMark, contextLevel } from '@aether/office-scene/model';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { Avatar } from './Avatar.js';
import { FEED_AVATAR_STATE } from './feed-avatar.js';
import { ago, type FeedItem } from './feed-model.js';

/** What a session's row says: who, the newest thing it said, what it is doing, how long ago. `extra` goes under the meta line. */
export function FeedRowBody({ item, extra }: { item: FeedItem; extra?: ReactNode }) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const context = item.session.usage.contextPct;
  const state =
    item.reason === 'permission'
      ? t('feedWaitingPermission')
      : item.reason === 'attention'
        ? t('feedWaitingYou')
        : item.tool;
  return (
    <>
      <Avatar
        seed={item.agent.id}
        species={item.agent.species}
        size="row"
        state={FEED_AVATAR_STATE[item.bucket]}
        squadHue={item.squad?.hue}
      />
      <span className="feed-main">
        <span className="feed-top">
          <ProviderMark provider={item.session.provider} />
          <strong title={item.session.title ?? item.label}>{item.label}</strong>
          {item.unread && <i className="unread-dot" role="img" aria-label={t('feedUnread')} />}
          <time className="feed-time">{ago(Date.now() - item.at, locale)}</time>
        </span>
        <span className="feed-meta">
          {item.where && (
            <span className="feed-where" title={item.where}>
              {item.where}
            </span>
          )}
          {state && (
            <span className="feed-state" title={state}>
              <i className="state-dot" />
              {state}
            </span>
          )}
        </span>
        {extra}
        <span className={`feed-reply ${item.reply ? '' : 'none'}`}>
          {item.reply ??
            t(item.session.process === 'running' ? 'feedNoReply' : 'feedReplyNotLoaded')}
        </span>
        {context !== null && (
          <span
            className="feed-ctx"
            role="meter"
            aria-label={t('convContext')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(context)}
            data-level={contextLevel(context)}
            title={`${t('convContext')} ${Math.round(context)}%`}
          >
            <i style={{ width: `${context}%` }} />
          </span>
        )}
      </span>
    </>
  );
}

/** One session without a squad: a button that opens its conversation. */
export const FeedRow = memo(function FeedRow({
  item,
  onOpen,
}: {
  item: FeedItem;
  onOpen: (agentId: string) => void;
}) {
  return (
    <button
      className={`feed-row bucket-${item.bucket} ${item.stale ? 'stale' : ''}`}
      data-agent={item.agent.id}
      onClick={() => onOpen(item.agent.id)}
    >
      <FeedRowBody item={item} />
    </button>
  );
});
