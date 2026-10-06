import { Fragment, useCallback, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Key } from '../i18n.js';
import { useT } from '../ui.js';
import { FeedRow } from './FeedRow.js';
import { FeedSquad } from './FeedSquad.js';
import { PermissionCards } from './PermissionCard.js';
import { SquadAnnouncer } from './SquadAnnouncer.js';
import { feedItems, type Feed, type FeedBucket } from './feed-model.js';
import { isSquadOpen, useSquadOpen } from './squad-open.js';

const BUCKET_ORDER = ['needs', 'working', 'finished', 'idle'] as const;
const HEADINGS: Record<FeedBucket, Key> = {
  needs: 'feedNeeds',
  working: 'feedWorking',
  finished: 'feedFinished',
  idle: 'feedIdle',
};

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

/**
 * The inbox: sessions grouped by what wants a person first, idle ones folded away. A session with subagents is a tree:
 * its row, and its subagents nested under it (they are never rows of their own).
 */
export function SessionFeed({ feed, onOpen }: { feed: Feed; onOpen: (agentId: string) => void }) {
  const t = useT();
  const squadOpen = useSquadOpen();
  // The rows are memoized: a handler that changes every render would redraw all of them on every event.
  const latest = useRef(onOpen);
  latest.current = onOpen;
  const open = useCallback((agentId: string) => latest.current(agentId), []);
  if (!feedItems(feed).length) return <FeedEmpty />;
  return (
    <div className="session-feed">
      <SquadAnnouncer feed={feed} />
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
                  {item.squad ? (
                    <FeedSquad
                      item={item}
                      open={isSquadOpen(squadOpen.state, item.key, item.squad)}
                      onToggle={squadOpen.setOpen}
                      onOpen={open}
                    />
                  ) : (
                    <FeedRow item={item} onOpen={open} />
                  )}
                  {bucket === 'needs' && <PermissionCards sessionKey={item.key} compact />}
                </Fragment>
              ))}
            </details>
          ),
      )}
    </div>
  );
}
