import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import {
  allQueries,
  backoffMs,
  initialLink,
  linkReducer,
  parseChange,
  queriesFor,
  type LinkAction,
  type LinkState,
  USAGE_KEY,
  type SessionChange,
} from './live-link.js';

const STREAM_URL = '/api/local-sessions/stream';
/** Changes that arrive together become one refresh. */
const BATCH_MS = 120;
/** A growing transcript changes every second, the token KPIs are refetched at most this often (the server rescans on each). */
const USAGE_GAP_MS = 5_000;

/** A random number in [0, 1) that spreads reconnects apart (not a secret). */
const jitter = () => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;

/** The link's state, shared: the connection indicator and every query that polls only while it is down read it. */
export const useLink = create<LinkState & { dispatch: (action: LinkAction) => void }>((set) => ({
  ...initialLink,
  dispatch: (action) => set((state) => linkReducer(state, action)),
}));
export const useLinkLive = () => useLink((s) => s.status === 'live');

/** How long until the token KPIs may be refetched again, given when they last were. */
export const usageDelay = (usageAt: number, now: number) =>
  Math.max(0, usageAt + USAGE_GAP_MS - now);

/** The stream's resume address: from the start, or after the last change seen. */
export const streamUrl = (last: number | null) =>
  last === null ? STREAM_URL : `${STREAM_URL}?after=${last}`;

/** The `seq` a `hello` or `resync` event carries. */
export const seqOf = (event: Event) =>
  Number((JSON.parse((event as MessageEvent<string>).data) as { seq: number }).seq);

/** Turns changes into refetches: batched, and the token KPIs at most every `USAGE_GAP_MS`. */
function createRefresher(client: QueryClient) {
  let pending: SessionChange[] = [];
  let batch: ReturnType<typeof setTimeout> | undefined;
  let usageTimer: ReturnType<typeof setTimeout> | undefined;
  let usageAt = 0;
  const refresh = (keys = queriesFor(pending)) => {
    pending = [];
    for (const queryKey of keys) {
      if (queryKey !== USAGE_KEY) void client.invalidateQueries({ queryKey });
      else if (!usageTimer)
        usageTimer = setTimeout(
          () => {
            usageTimer = undefined;
            usageAt = Date.now();
            void client.invalidateQueries({ queryKey });
          },
          usageDelay(usageAt, Date.now()),
        );
    }
  };
  const queue = (change: SessionChange) => {
    pending.push(change);
    batch ??= setTimeout(() => {
      batch = undefined;
      refresh();
    }, BATCH_MS);
  };
  const dispose = () => {
    clearTimeout(batch);
    clearTimeout(usageTimer);
  };
  return { refresh, queue, dispose };
}
type Refresher = ReturnType<typeof createRefresher>;
type Dispatch = (action: LinkAction) => void;

type Connection = {
  source: EventSource | null;
  retry: ReturnType<typeof setTimeout> | undefined;
  attempt: number;
  last: number | null;
};

/** What each event of the stream does to the connection state and the queries. */
function listen(es: EventSource, c: Connection, refresher: Refresher, dispatch: Dispatch) {
  es.addEventListener('hello', (e) => {
    const seq = seqOf(e);
    if (c.last === null) {
      c.last = seq;
      refresher.refresh(allQueries()); // what the page read before the baseline may predate it, and no change would ever say so
    }
    c.attempt = 0;
    dispatch({ type: 'open', at: Date.now() });
  });
  es.addEventListener('session', (e) => {
    const change = parseChange((e as MessageEvent<string>).data);
    if (!change) return;
    c.last = change.seq;
    dispatch({ type: 'message', at: Date.now() });
    refresher.queue(change);
  });
  es.addEventListener('resync', (e) => {
    c.last = seqOf(e);
    refresher.refresh(allQueries());
  });
}

/** One EventSource at a time: connects from the last change seen, and reconnects with backoff and jitter when it drops. */
function createConnection(refresher: Refresher, dispatch: Dispatch) {
  const c: Connection = { source: null, retry: undefined, attempt: 0, last: null };
  const stop = () => {
    c.source?.close();
    c.source = null;
    clearTimeout(c.retry);
  };
  const connect = () => {
    stop();
    const es = new EventSource(streamUrl(c.last));
    c.source = es;
    listen(es, c, refresher, dispatch);
    es.onerror = () => {
      if (c.source !== es) return;
      stop();
      dispatch({ type: 'lost', online: navigator.onLine });
      c.retry = setTimeout(connect, backoffMs(c.attempt++, jitter()));
    };
  };
  // Waking, becoming visible or getting the network back: reconnect now and refetch, changes may have been missed.
  const resume = () => {
    if (document.visibilityState === 'hidden') return;
    c.attempt = 0;
    connect();
    refresher.refresh(allQueries());
  };
  return { connect, stop, resume };
}

/**
 * Keeps the session queries fresh from the control plane's change stream: a change marks what it touches stale, so the
 * pages refetch the moment something happens instead of on a timer. It reconnects with backoff and jitter, pauses while
 * the tab is hidden and resyncs when it comes back, the device wakes or the network returns. While it is not live the
 * queries fall back to their own polling (see `pollMs`).
 */
export function useSessionStream(enabled: boolean) {
  const client = useQueryClient();
  const dispatch = useLink((s) => s.dispatch);
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const refresher = createRefresher(client);
    const { connect, stop, resume } = createConnection(refresher, dispatch);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        dispatch({ type: 'reset' });
      } else resume();
    };
    const onPageShow = (e: PageTransitionEvent) => e.persisted && resume(); // restored from the back-forward cache
    // A connection that dies silently (a phone leaving Wi-Fi) is not noticed by the stream itself: the browser says so.
    const onOffline = () => {
      stop();
      dispatch({ type: 'lost', online: false });
    };
    if (document.visibilityState !== 'hidden') connect();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      stop();
      refresher.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', onPageShow);
      dispatch({ type: 'reset' });
    };
  }, [enabled, client, dispatch]);
}
