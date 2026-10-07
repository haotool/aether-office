import { useEffect, useMemo, useReducer, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SetURLSearchParams } from 'react-router-dom';
import { type LocalSessionsResponse } from '@aether/contracts';
import { api, ensureCsrf, forgetCsrf, type Session } from './api.js';
import { activityOf, sessionLink } from './localSessions.js';
import { isDomainEvent } from './stream-event.js';
import { useSessionAlerts, type AlertSink } from './notifications.js';
import {
  TOUR_INTERVAL_MS,
  idle,
  restoreFocus,
  tourFocus,
  tourReducer,
  type TourAction,
} from './tour.js';

const TITLE = 'AETHER OFFICE · 軌道辦公室';

/** The theme and language of the document, and a tab title that carries how many things wait for the person. */
export function useDocumentChrome(theme: string, locale: string, waitingOn: number) {
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.lang = locale === 'zh-TW' ? 'zh-Hant' : 'en';
  }, [theme, locale]);
  useEffect(() => {
    // The browser's address bar and the phone's status bar take the page's own surface color, whatever the system theme is.
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
      meta.setAttribute('content', surface);
  }, [theme]);
  useEffect(() => {
    document.title = waitingOn ? `(${waitingOn}) ${TITLE}` : TITLE;
  }, [waitingOn]);
}

/** Brings the feed row of a member into view and focuses it, once the panel has drawn. */
export function focusFeedRow(id: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`.feed-row[data-agent="${CSS.escape(id)}"]`);
      row?.scrollIntoView({ block: 'center' });
      row?.focus();
    }),
  );
}

/** The guided tour: its state and one `act` that also puts the camera focus back where the tour found it. */
export function useTour(setFocus: (focus: string) => void) {
  const [tour, dispatch] = useReducer(tourReducer, idle);
  const act = (action: TourAction) => {
    const restore = restoreFocus(tour, action, tourReducer(tour, action));
    dispatch(action);
    if (restore) setFocus(restore);
  };
  useEffect(() => {
    const target = tourFocus(tour);
    if (target) setFocus(target);
    if (tour.status !== 'playing') return;
    const timer = setTimeout(() => act({ type: 'skip' }), TOUR_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [tour]); // eslint-disable-line react-hooks/exhaustive-deps -- `act` only closes over `tour`, this effect's dependency
  return { tour, act };
}

/** Ctrl/Cmd+K toggles the quick-open palette. */
export function useQuickOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

/**
 * The project's event stream: every domain event refreshes the snapshot, a fault or a malformed event marks the page
 * offline. Reopens from the snapshot's sequence number when it changes.
 */
export function useProjectStream(
  projectId: string | undefined,
  enabled: boolean,
  seq: string | undefined,
  setOffline: (offline: boolean) => void,
) {
  const client = useQueryClient();
  useEffect(() => {
    if (!projectId || !enabled || !seq) return;
    const stream = new EventSource(
      `/api/projects/${projectId}/stream?after=${encodeURIComponent(seq)}`,
    );
    stream.onopen = () => setOffline(false);
    stream.onerror = () => setOffline(true);
    stream.addEventListener('domain', (e) => {
      if (isDomainEvent(String((e as MessageEvent).data)))
        void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
      else setOffline(true);
    });
    stream.addEventListener('fault', () => {
      setOffline(true);
      void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
    });
    return () => stream.close();
  }, [projectId, enabled, seq, client, setOffline]);
}

/**
 * Raises the alerts for sessions that started waiting for a human, or finished (alert-rules.ts). What counts as unread is
 * the feed's business (features/feed-model.ts), so every badge shows the same number.
 */
export function useSessionNotices(
  sessions: LocalSessionsResponse['sessions'] | undefined,
  notify: boolean,
  labels: { needsYou: string; finished: string },
  sink: AlertSink,
  /** Sessions with a permission request waiting here: they need a person now, whatever their hooks last said. */
  asking: ReadonlySet<string>,
) {
  const briefs = useMemo(
    () =>
      sessions?.map((s) => ({
        key: s.key,
        activity: asking.has(s.key) ? 'waiting_permission' : activityOf(s, Date.now()),
        project: s.repo,
        to: sessionLink(s),
      })),
    [sessions, asking],
  );
  const alertLabels = useMemo(
    () => ({ needsYou: labels.needsYou, finished: labels.finished }),
    [labels.needsYou, labels.finished],
  );
  useSessionAlerts(briefs, notify, alertLabels, sink);
}

/** Who is signed in: the session the server knows this browser by, and the way out. */
export function useAuthSession() {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    api<Session>('/api/session')
      // signed in without a CSRF token (the tab was closed): gets one before the page can write
      .then(async (found) => {
        await ensureCsrf().catch(() => undefined);
        setSession(found);
      })
      .catch(() => setSession(null))
      .finally(() => setChecked(true));
  }, []);
  // A pairing link opened where a session already exists: its code is no use here, and does not stay in the address bar.
  useEffect(() => {
    if (session && window.location.hash.startsWith('#pair='))
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [session]);
  const logout = async () => {
    try {
      await api('/api/logout', { method: 'POST', body: '{}' });
    } finally {
      forgetCsrf();
      setSession(null);
      client.clear();
    }
  };
  return { session, setSession, checked, logout };
}

/**
 * A link asked for the selected member to be brought into view ("show in office", a feed row of another project): the
 * camera flies to it once it has a desk in the scene (on a phone and on a desktop), and the request leaves the address.
 */
export function useFocusRequest(
  params: URLSearchParams,
  setParams: SetURLSearchParams,
  selectedAgentId: string | undefined,
  setFocus: (focus: string) => void,
) {
  const requested = params.get('focus') === '1';
  useEffect(() => {
    if (!requested || !selectedAgentId) return;
    setFocus(selectedAgentId);
    setParams(
      (p) => {
        p.delete('focus');
        return p;
      },
      { replace: true },
    );
  }, [requested, selectedAgentId, setFocus, setParams]);
}
