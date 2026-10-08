import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, MessageSquareText, Rows2, Rows3, Search } from 'lucide-react';
import { api } from '../../lib/api/api.js';
import { usePreferences } from '../../lib/preferences/state.js';
import { useT } from '../../ui/useT.js';
import { sameDay } from './conv-time.js';
import { DaySeparator, NowProvider } from './ConvTime.js';
import { FindBar, useConvFind } from './ConvFind.js';
import { pollMs } from '../integrations/live-link.js';
import { PendingBubbles } from './PendingBubbles.js';
import { seenBaseline } from '../sessions/session-seen.js';
import { ThinkingLine } from './ThinkingLine.js';
import { TurnView } from './TranscriptTurns.js';
import { useConvDensity } from './use-conv-density.js';
import { useConvKeys } from './use-conv-keys.js';
import { useConvScroll } from './use-conv-scroll.js';
import { firstUnreadId, turnIds, useFreshIds } from './use-fresh-ids.js';
import { useLinkLive } from '../../hooks/use-session-stream.js';
import { groupTurns, reuseTurns, type Entry, type Turn } from './turn-groups.js';

type TranscriptViewProps = {
  sessionKey: string;
  working: boolean;
  children?: ReactNode;
};

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

/** The transcript of one session, grouped into turns (kept stable between fetches) with the prompts it shows. */
function useTranscript(sessionKey: string, working: boolean) {
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
  return { query, entries, turns, prompts };
}

function TranscriptError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="conv-body">
      <div className="conv-state" role="alert">
        <strong>{t('convErrorTitle')}</strong>
        <p>{message}</p>
        <button type="button" className="secondary" onClick={onRetry}>
          {t('convRetry')}
        </button>
      </div>
    </div>
  );
}

/** Find and density buttons above the conversation. */
function ConvTools({
  find,
  density,
  onToggleDensity,
}: {
  find: ReturnType<typeof useConvFind>;
  density: string;
  onToggleDensity: () => void;
}) {
  const t = useT();
  const compact = density === 'compact';
  return (
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
        aria-label={compact ? t('convComfortable') : t('convCompact')}
        title={compact ? t('convComfortable') : t('convCompact')}
        aria-pressed={compact}
        onClick={onToggleDensity}
      >
        {compact ? <Rows3 size={15} aria-hidden /> : <Rows2 size={15} aria-hidden />}
      </button>
    </div>
  );
}

/** The turns, each in its own slot, with a day separator where the day changes. */
function TurnList({
  turns,
  isFresh,
  unreadId,
}: {
  turns: readonly Turn[];
  isFresh: (id: string) => boolean;
  unreadId: string | null;
}) {
  return turns.map((turn, i) => {
    const at = turnAt(turn);
    const prev = turns[i - 1];
    const before = prev ? turnAt(prev) : null;
    const newDay =
      at !== null && (i === 0 ? !sameDay(at, Date.now()) : before !== null && !sameDay(at, before));
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
  });
}

function EmptyConversation() {
  const t = useT();
  return (
    <div className="conv-state">
      <MessageSquareText size={20} aria-hidden />
      <strong>{t('convEmpty')}</strong>
      <p>{t('convEmptyHint')}</p>
    </div>
  );
}

/** A running tool group has its own live state; otherwise a working session shows the "working" line. */
function hasRunningTools(turns: readonly Turn[]) {
  const last = turns.at(-1)?.blocks.at(-1);
  return last?.type === 'tools' && last.calls.some((c) => c.result === null);
}

/**
 * The conversation's own find. Ctrl/Cmd+F opens it only for a reader whose focus is inside the conversation, and only
 * where matches can be painted; anywhere else the browser's find is left alone.
 */
function useTranscriptFind(scroller: RefObject<HTMLElement | null>, entries: unknown) {
  const find = useConvFind(scroller, entries);
  const closeFind = () => {
    find.setOpen(false);
    find.setQuery('');
    scroller.current?.focus();
  };
  const onBodyKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && find.supported) {
      e.preventDefault();
      find.setOpen(true);
    }
  };
  return { find, closeFind, onBodyKey };
}

/** "N new" (or "latest") while the reader is scrolled up: one press goes to the newest message. */
function NewPill({ unseen, onClick }: { unseen: number; onClick: () => void }) {
  const t = useT();
  return (
    <button className="new-pill" onClick={onClick}>
      <ArrowDown size={14} aria-hidden />
      {unseen > 0 ? `${unseen} ${t('convNew')}` : t('convLatest')}
    </button>
  );
}

/**
 * What a session is saying and doing, as turns. It follows the newest message while you are at the bottom; if you have
 * scrolled up to read, it leaves you there and offers a "N new" pill instead. Refetched when the change stream says it
 * moved; polls only while that is down and the page is visible. `children` is drawn at the end of the scrolling area (the
 * session's details). With focus inside: j and k move between turns, `g g` and `G` go to the ends, and Ctrl or Cmd+F opens
 * a find that searches the loaded messages.
 */
export function TranscriptView({ sessionKey, working, children }: TranscriptViewProps) {
  const t = useT();
  const still = usePreferences((s) => s.reducedMotion);
  const { query, entries, turns, prompts } = useTranscript(sessionKey, working);
  const ids = useMemo(() => (entries ? turns.flatMap(turnIds) : null), [entries, turns]);
  const arrived = useFreshIds(sessionKey, ids);
  // When the person last looked is read as the conversation opens: what happened after is "new since you looked".
  const [seenAt] = useState(() => seenBaseline(sessionKey));
  const unreadId = useMemo(() => firstUnreadId(turns, seenAt), [turns, seenAt]);
  const showThinking = working && !hasRunningTools(turns);
  const { scroller, onScroll, toBottom, stopGliding, unseen, away } = useConvScroll(entries, still);
  const [density, toggleDensity] = useConvDensity();
  const onKeys = useConvKeys(scroller, toBottom, stopGliding, still);
  const { find, closeFind, onBodyKey } = useTranscriptFind(scroller, entries);

  if (query.error)
    return <TranscriptError message={query.error.message} onRetry={() => void query.refetch()} />;
  if (!entries) return <TranscriptSkeleton />;
  return (
    <NowProvider>
      <div className="conv-body" data-density={density} onKeyDown={onBodyKey}>
        {find.open ? (
          <FindBar find={find} onClose={closeFind} />
        ) : (
          <ConvTools find={find} density={density} onToggleDensity={toggleDensity} />
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
          <TurnList turns={turns} isFresh={(id) => !still && arrived(id)} unreadId={unreadId} />
          <PendingBubbles sessionKey={sessionKey} prompts={prompts} />
          {showThinking && (
            <ThinkingLine key={prompts.at(-1)?.at ?? 0} since={prompts.at(-1)?.at ?? null} />
          )}
          {!turns.length && <EmptyConversation />}
          {children}
        </div>
        {(unseen > 0 || away) && <NewPill unseen={unseen} onClick={toBottom} />}
      </div>
    </NowProvider>
  );
}
