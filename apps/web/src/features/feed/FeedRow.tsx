import { memo, type ReactNode } from 'react';
import { formatAgo } from '@aether/kernel';
import { ProviderMark, contextLevel } from '@aether/office-scene/model';
import { useT, useLocale } from '../../ui/useT.js';
import { Avatar } from '../office/Avatar.js';
import { FEED_AVATAR_STATE } from './feed-avatar.js';
import { contextLabel } from '../sessions/context-label.js';
import { noReplyKey, type FeedItem } from './feed-model.js';

function ContextMeter({ session, context }: { session: FeedItem['session']; context: number }) {
  const t = useT();
  const locale = useLocale();
  return (
    <span
      className="feed-ctx"
      role="meter"
      aria-label={t('convContext')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(context)}
      data-level={contextLevel(context)}
      title={contextLabel(session.usage, t, locale) ?? undefined}
    >
      <i style={{ width: `${context}%` }} />
    </span>
  );
}

export function FeedRowBody({ item, extra }: { item: FeedItem; extra?: ReactNode }) {
  const t = useT();
  const locale = useLocale();
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
          <time className="feed-time">{formatAgo(Date.now() - item.at, locale)}</time>
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
          {item.reply ?? t(noReplyKey(item))}
        </span>
        {context !== null && <ContextMeter session={item.session} context={context} />}
      </span>
    </>
  );
}

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
