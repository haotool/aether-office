import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, MessageSquareText, Rows2, Rows3, Search } from 'lucide-react';
import { api } from '../api.js';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { sameDay } from './conv-time.js';
import { DaySeparator, NowProvider } from './ConvTime.js';
import { FindBar, useConvFind } from './ConvFind.js';
import { pollMs } from './live-link.js';
import { PendingBubbles } from './PendingBubbles.js';
import { seenBaseline } from './session-seen.js';
import { ThinkingLine } from './ThinkingLine.js';
import { TurnView } from './TranscriptTurns.js';
import { useConvDensity } from './use-conv-density.js';
import { useConvKeys } from './use-conv-keys.js';
import { useConvScroll } from './use-conv-scroll.js';
import { firstUnreadId, turnIds, useFreshIds } from './use-fresh-ids.js';
import { useLinkLive } from './use-session-stream.js';
import { groupTurns, reuseTurns, type Entry, type Turn } from './turn-groups.js';

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

const POLL_WORKING_MS = 2000;
const POLL_QUIET_MS = 6000;

const turnAt = (turn: Turn) => turn.user?.at ?? turn.blocks.find((b) => b.at)?.at ?? null;

/**
 * What a session is saying and doing, as turns. It follows the newest message while you are at the bottom; if you have
 * scrolled up to read, it leaves you there and offers a "N new" pill instead. Refetched when the change stream says it
 * moved; polls only while that is down and the page is visible. `children` is drawn at the end of the scrolling area (the
 * session's details). With focus inside: j and k move between turns, `g g` and `G` go to the ends, and Ctrl or Cmd+F opens
 * a find that searches the loaded messages.
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
  const previous = useRef<Turn[]>([]);
  const turns = useMemo(() => {
    previous.current = reuseTurns(previous.current, groupTurns(entries ?? []));
    return previous.current;
  }, [entries]);
  // The prompts the transcript shows: what lets a message typed in the composer give way to its real bubble.
  const prompts = useMemo(
    () => (entries ?? []).filter((e) => e.role === 'user').map((e) => ({ text: e.text, at: e.at })),
    [entries],
  );
  const ids = useMemo(() => (entries ? turns.flatMap(turnIds) : null), [entries, turns]);
  const arrived = useFreshIds(sessionKey, ids);
  const isFresh = (id: string) => !still && arrived(id);
  // When the person last looked is read as the conversation opens: what happened after is "new since you looked".
  const [seenAt] = useState(() => seenBaseline(sessionKey));
  const unreadId = useMemo(() => firstUnreadId(turns, seenAt), [turns, seenAt]);
  const last = turns.at(-1)?.blocks.at(-1);
  // A running tool group has its own live state; otherwise a working session shows the "working" line.
  const showThinking =
    working && !(last?.type === 'tools' && last.calls.some((c) => c.result === null));
  const { scroller, onScroll, toBottom, stopGliding, unseen, away } = useConvScroll(entries, still);
  const [density, toggleDensity] = useConvDensity();
  const find = useConvFind(scroller, entries);
  const onKeys = useConvKeys(scroller, toBottom, stopGliding, still);
  const closeFind = () => {
    find.setOpen(false);
    find.setQuery('');
    scroller.current?.focus();
  };
  // Ctrl/Cmd+F opens the conversation's own find only for a reader whose focus is inside it, and only where matches can be
  // painted; anywhere else the browser's find is left alone.
  const onBodyKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && find.supported) {
      e.preventDefault();
      find.setOpen(true);
    }
  };

  if (query.error)
    return (
      <div className="conv-body">
        <div className="conv-state" role="alert">
          <strong>{t('convErrorTitle')}</strong>
          <p>{query.error.message}</p>
          <button type="button" className="secondary" onClick={() => void query.refetch()}>
            {t('convRetry')}
          </button>
        </div>
      </div>
    );
  if (!entries) return <TranscriptSkeleton />;
  return (
    <NowProvider>
      <div className="conv-body" data-density={density} onKeyDown={onBodyKey}>
        {find.open ? (
          <FindBar find={find} onClose={closeFind} />
        ) : (
          <div className="conv-tools">
            {find.supported && (
              <button
                type="button"
                className="icon-button"
                aria-label={t('convFind')}
                title={t('convFind')}
                aria-keyshortcuts="Control+F Meta+F"
                onClick={() => find.setOpen(true)}
              >
                <Search size={15} aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label={density === 'compact' ? t('convComfortable') : t('convCompact')}
              title={density === 'compact' ? t('convComfortable') : t('convCompact')}
              aria-pressed={density === 'compact'}
              onClick={toggleDensity}
            >
              {density === 'compact' ? (
                <Rows3 size={15} aria-hidden />
              ) : (
                <Rows2 size={15} aria-hidden />
              )}
            </button>
          </div>
        )}
        <div
          className="conv-scroll"
          ref={scroller}
          onScroll={onScroll}
          onWheel={stopGliding}
          onTouchStart={stopGliding}
          onKeyDown={onKeys}
          aria-keyshortcuts="J K G"
          tabIndex={0}
        >
          {query.data?.truncated && <p className="conv-note">{t('convTrimmed')}</p>}
          {turns.map((turn, i) => {
            const at = turnAt(turn);
            const before = i > 0 ? turnAt(turns[i - 1]!) : null;
            const newDay =
              at !== null &&
              (i === 0 ? !sameDay(at, Date.now()) : before !== null && !sameDay(at, before));
            return (
              <div key={`${turn.id}:${i}`} className="turn-slot">
                {newDay && <DaySeparator at={at} />}
                <TurnView
                  turn={turn}
                  isFresh={isFresh}
                  newest={i === turns.length - 1}
                  unreadId={unreadId}
                />
              </div>
            );
          })}
          <PendingBubbles sessionKey={sessionKey} prompts={prompts} />
          {showThinking && (
            <ThinkingLine key={prompts.at(-1)?.at ?? 0} since={prompts.at(-1)?.at ?? null} />
          )}
          {!turns.length && (
            <div className="conv-state">
              <MessageSquareText size={20} aria-hidden />
              <strong>{t('convEmpty')}</strong>
              <p>{t('convEmptyHint')}</p>
            </div>
          )}
          {children}
        </div>
        {(unseen > 0 || away) && (
          <button className="new-pill" onClick={toBottom}>
            <ArrowDown size={14} aria-hidden />
            {unseen > 0 ? `${unseen} ${t('convNew')}` : t('convLatest')}
          </button>
        )}
      </div>
    </NowProvider>
  );
}
