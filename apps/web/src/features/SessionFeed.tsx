import { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProviderMark, contextLevel } from '@aether/office-scene/model';
import type { Key } from '../i18n.js';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { Avatar } from './Avatar.js';
import { FEED_AVATAR_STATE } from './feed-avatar.js';
import { PermissionCards } from './PermissionCard.js';
import { ago, feedItems, type Feed, type FeedBucket, type FeedItem } from './feed-model.js';

const BUCKET_ORDER = ['needs', 'working', 'finished', 'idle'] as const;
const HEADINGS: Record<FeedBucket, Key> = {
  needs: 'feedNeeds',
  working: 'feedWorking',
  finished: 'feedFinished',
  idle: 'feedIdle',
};

/** One session: who, the newest thing it said, what it is doing, how long ago. */
function FeedRow({ item, onOpen }: { item: FeedItem; onOpen: (agentId: string) => void }) {
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
    <button
      className={`feed-row bucket-${item.bucket} ${item.stale ? 'stale' : ''}`}
      data-agent={item.agent.id}
      onClick={() => onOpen(item.agent.id)}
    >
      <Avatar
        seed={item.agent.id}
        species={item.agent.species}
        size="row"
        state={FEED_AVATAR_STATE[item.bucket]}
      />
      <span className="feed-main">
        <span className="feed-top">
          <ProviderMark provider={item.session.provider} />
          <strong title={item.label}>{item.label}</strong>
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
        <span className={`feed-reply ${item.reply ? '' : 'none'}`}>
          {item.reply ?? t('feedNoReply')}
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
    </button>
  );
}

/** Nothing to show: say what to do, in words (no picture). */
function FeedEmpty() {
  const t = useT();
  return (
    <div className="feed-empty">
      <h3>{t('feedEmptyTitle')}</h3>
      <p>{t('feedEmptyHint')}</p>
      <ol>
        <li>{t('feedEmptyStep1')}</li>
        <li>{t('feedEmptyStep2')}</li>
      </ol>
    </div>
  );
}

/** The inbox: sessions grouped by what wants a person first, idle ones folded away. */
export function SessionFeed({ feed, onOpen }: { feed: Feed; onOpen: (agentId: string) => void }) {
  const t = useT();
  if (!feedItems(feed).length) return <FeedEmpty />;
  return (
    <div className="session-feed">
      {BUCKET_ORDER.map(
        (bucket) =>
          feed[bucket].length > 0 && (
            <details
              key={bucket}
              className={`feed-group bucket-${bucket}`}
              open={bucket !== 'idle'}
            >
              <summary>
                <ChevronDown size={13} aria-hidden />
                <span className="group-name">{t(HEADINGS[bucket])}</span>
                <span className="group-count">{feed[bucket].length}</span>
              </summary>
              {feed[bucket].map((item) => (
                <Fragment key={item.key}>
                  <FeedRow item={item} onOpen={onOpen} />
                  {bucket === 'needs' && <PermissionCards sessionKey={item.key} compact />}
                </Fragment>
              ))}
            </details>
          ),
      )}
    </div>
  );
}
