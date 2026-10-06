import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown } from 'lucide-react';
import { api } from '../api.js';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { pollMs } from './live-link.js';
import { PendingBubbles } from './PendingBubbles.js';
import { ThinkingLine } from './ThinkingLine.js';
import { TurnView } from './TranscriptTurns.js';
import { turnIds, useFreshIds } from './use-fresh-ids.js';
import { useLinkLive } from './use-session-stream.js';
import { anchorOf, groupTurns, newMessagesSince, type Entry } from './turn-groups.js';

/** Rows where the messages will be, while the first fetch is out: no spinner, no jump when they arrive. */
function TranscriptSkeleton() {
  const t = useT();
  return (
    <div className="conv-body">
      <div className="conv-scroll skeleton" role="status" aria-label={t('loading')}>
        {['user', 'reply', 'tools', 'reply'].map((kind, i) => (
          <div key={i} className={`skeleton-row ${kind}`}>
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}

type Transcript = { entries: Entry[]; updatedAt: number; truncated: boolean };

const NEAR_BOTTOM_PX = 48;
const POLL_WORKING_MS = 2000;
const POLL_QUIET_MS = 6000;

/**
 * What a session is saying and doing, as turns. It follows the newest message while you are at the bottom; if you have
 * scrolled up to read, it leaves you there and offers a "N new" pill instead. Refetched when the change stream says it moved; polls only while that is down and the page is visible.
 * `children` is drawn at the end of the scrolling area (the session's details).
 */
export function TranscriptView({
  sessionKey,
  working,
  children,
}: {
  sessionKey: string;
  working: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const still = usePreferences((s) => s.reducedMotion);
  const live = useLinkLive();
  const query = useQuery({
    queryKey: ['transcript', sessionKey],
    queryFn: () =>
      api<Transcript>(`/api/local-sessions/${encodeURIComponent(sessionKey)}/transcript`),
    refetchInterval: pollMs(live, working ? POLL_WORKING_MS : POLL_QUIET_MS),
    refetchIntervalInBackground: false,
    retry: false,
  });
  const entries = query.data?.entries;
  const turns = useMemo(() => groupTurns(entries ?? []), [entries]);
  // The prompts the transcript shows: what lets a message typed in the composer give way to its real bubble.
  const prompts = useMemo(
    () => (entries ?? []).filter((e) => e.role === 'user').map((e) => ({ text: e.text, at: e.at })),
    [entries],
  );
  const ids = useMemo(() => (entries ? turns.flatMap(turnIds) : null), [entries, turns]);
  const arrived = useFreshIds(sessionKey, ids);
  const isFresh = (id: string) => !still && arrived(id);
  const last = turns.at(-1)?.blocks.at(-1);
  // A running tool group has its own live state; otherwise a working session shows the "working" line.
  const showThinking =
    working && !(last?.type === 'tools' && last.calls.some((c) => c.result === null));
  const scroller = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const following = useRef(true);
  const anchor = useRef<string | null>(null);
  // A smooth scroll to the newest message is under way: its in-between positions are not "scrolled away".
  const jumping = useRef(false);
  const [unseen, setUnseen] = useState(0);
  const [away, setAway] = useState(false);

  // New data: stay with the newest message, or count what arrived out of sight.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !entries) return;
    if (following.current) {
      // The first look lands at the bottom at once; what arrives later is followed with a short glide.
      const glide = loaded.current && !still;
      jumping.current = glide && el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_PX;
      el.scrollTo({ top: el.scrollHeight, behavior: glide ? 'smooth' : 'auto' });
      anchor.current = anchorOf(entries);
      setUnseen(0);
    } else setUnseen(newMessagesSince(entries, anchor.current));
    loaded.current = true;
  }, [entries, still]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (jumping.current && fromBottom >= NEAR_BOTTOM_PX) return;
    jumping.current = false;
    following.current = fromBottom < NEAR_BOTTOM_PX;
    setAway(fromBottom > el.clientHeight);
    if (following.current && entries) {
      anchor.current = anchorOf(entries);
      setUnseen(0);
    }
  };
  const toBottom = () => {
    const el = scroller.current;
    if (!el) return;
    following.current = true;
    jumping.current = !still;
    anchor.current = entries ? anchorOf(entries) : null;
    setUnseen(0);
    setAway(false);
    el.scrollTo({ top: el.scrollHeight, behavior: still ? 'auto' : 'smooth' });
  };

  if (query.error) return <p role="alert">{query.error.message}</p>;
  if (!entries) return <TranscriptSkeleton />;
  return (
    <div className="conv-body">
      <div
        className="conv-scroll"
        ref={scroller}
        onScroll={onScroll}
        onWheel={() => (jumping.current = false)}
        onTouchStart={() => (jumping.current = false)}
        tabIndex={0}
      >
        {query.data?.truncated && <p className="conv-note">{t('convTrimmed')}</p>}
        {turns.map((turn, i) => (
          <TurnView
            key={`${turn.id}:${i}`}
            turn={turn}
            isFresh={isFresh}
            newest={i === turns.length - 1}
          />
        ))}
        <PendingBubbles sessionKey={sessionKey} prompts={prompts} />
        {showThinking && (
          <ThinkingLine key={prompts.at(-1)?.at ?? 0} since={prompts.at(-1)?.at ?? null} />
        )}
        {!turns.length && <p className="conv-note">{t('convEmpty')}</p>}
        {children}
      </div>
      {(unseen > 0 || away) && (
        <button className="new-pill" onClick={toBottom}>
          <ArrowDown size={14} aria-hidden />
          {unseen > 0 ? `${unseen} ${t('convNew')}` : t('convLatest')}
        </button>
      )}
    </div>
  );
}
