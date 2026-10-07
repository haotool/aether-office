import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
const jitter = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/** The link's state, shared: the connection indicator and every query that polls only while it is down read it. */
export const useLink = create<LinkState & { dispatch: (action: LinkAction) => void }>((set) => ({
  ...initialLink,
  dispatch: (action) => set((state) => linkReducer(state, action)),
}));
export const useLinkLive = () => useLink((s) => s.status === 'live');

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
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let batch: ReturnType<typeof setTimeout> | undefined;
    let pending: SessionChange[] = [];
    let attempt = 0;
    let usageTimer: ReturnType<typeof setTimeout> | undefined;
    let usageAt = 0;
    let last: number | null = null;
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
            Math.max(0, usageAt + USAGE_GAP_MS - Date.now()),
          );
      }
    };
    const stop = () => {
      source?.close();
      source = null;
      clearTimeout(retry);
    };
    const connect = () => {
      stop();
      const es = new EventSource(last === null ? STREAM_URL : `${STREAM_URL}?after=${last}`);
      source = es;
      es.addEventListener('hello', (e) => {
        const seq = Number((JSON.parse((e as MessageEvent<string>).data) as { seq: number }).seq);
        if (last === null) {
          last = seq;
          refresh(allQueries()); // what the page read before the baseline may predate it, and no change would ever say so
        }
        attempt = 0;
        dispatch({ type: 'open', at: Date.now() });
      });
      es.addEventListener('session', (e) => {
        const change = parseChange((e as MessageEvent<string>).data);
        if (!change) return;
        last = change.seq;
        dispatch({ type: 'message', at: Date.now() });
        pending.push(change);
        batch ??= setTimeout(() => {
          batch = undefined;
          refresh();
        }, BATCH_MS);
      });
      es.addEventListener('resync', (e) => {
        last = Number((JSON.parse((e as MessageEvent<string>).data) as { seq: number }).seq);
        refresh(allQueries());
      });
      es.onerror = () => {
        if (source !== es) return;
        stop();
        dispatch({ type: 'lost', online: navigator.onLine });
        retry = setTimeout(connect, backoffMs(attempt++, jitter()));
      };
    };
    // Waking, becoming visible or getting the network back: reconnect now and refetch, changes may have been missed.
    const resume = () => {
      if (document.visibilityState === 'hidden') return;
      attempt = 0;
      connect();
      refresh(allQueries());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        dispatch({ type: 'reset' });
      } else resume();
    };
    const onPageShow = (e: PageTransitionEvent) => e.persisted && resume(); // restored from the back-forward cache
    if (document.visibilityState !== 'hidden') connect();
    // A connection that dies silently (a phone leaving Wi-Fi) is not noticed by the stream itself: the browser says so.
    const onOffline = () => {
      stop();
      dispatch({ type: 'lost', online: false });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      stop();
      clearTimeout(batch);
      clearTimeout(usageTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', onPageShow);
      dispatch({ type: 'reset' });
    };
  }, [enabled, client, dispatch]);
}
