import { useEffect, useMemo, useReducer, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SetURLSearchParams } from 'react-router-dom';
import { type LocalSessionsResponse } from '@aether/contracts';
import { api } from '../api/api.js';
import { ensureCsrf, forgetCsrf } from '../api/api-csrf.js';
import { markSignedOut, type Session } from '../api/api-session.js';
import { activityOf } from '../sessions/session-attention.js';
import { sessionLink } from '../sessions/session-names.js';
import { useLatest } from '../../hooks/use-latest.js';
import { isDomainEvent } from '../sessions/stream-event.js';
import { useSessionAlerts, type AlertSink } from '../notifications/notifications.js';
import {
  TOUR_INTERVAL_MS,
  idle,
  restoreFocus,
  tourFocus,
  tourReducer,
  type TourAction,
} from '../navigation/tour.js';

const BRAND = 'AETHER OFFICE';

export const documentTitle = (page: string, waitingOn: number) =>
  `${waitingOn ? `(${waitingOn}) ` : ''}${page ? `${page} · ` : ''}${BRAND}`;

export function useDocumentTitle(page: string, waitingOn: number) {
  useEffect(() => {
    document.title = documentTitle(page, waitingOn);
  }, [page, waitingOn]);
}

const HTML_LANG: Record<string, string> = { 'zh-TW': 'zh-Hant', en: 'en' };

export function useSignedOutTitle(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) document.title = documentTitle('', 0);
  }, [signedIn]);
}

export function useDocumentChrome(theme: string, locale: string) {
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.lang = HTML_LANG[locale] ?? 'en';
  }, [theme, locale]);
  useEffect(() => {
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
    for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
      meta.setAttribute('content', surface);
  }, [theme]);
}

export function focusFeedRow(id: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`.feed-row[data-agent="${CSS.escape(id)}"]`);
      row?.scrollIntoView({ block: 'center' });
      row?.focus();
    }),
  );
}

export function useTour(setFocus: (focus: string) => void) {
  const [tour, dispatch] = useReducer(tourReducer, idle);
  const act = (action: TourAction) => {
    const restore = restoreFocus(tour, action, tourReducer(tour, action));
    dispatch(action);
    if (restore) setFocus(restore);
  };
  const latest = useLatest({ act, setFocus });
  useEffect(() => {
    const target = tourFocus(tour);
    if (target) latest.current.setFocus(target);
    if (tour.status !== 'playing') return;
    const timer = setTimeout(() => latest.current.act({ type: 'skip' }), TOUR_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [tour, latest]);
  return { tour, act };
}

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
      if (isDomainEvent(String((e as MessageEvent).data))) {
        void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
        void client.invalidateQueries({ queryKey: ['approvals', projectId] });
      } else setOffline(true);
    });
    stream.addEventListener('fault', () => {
      setOffline(true);
      void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
    });
    return () => stream.close();
  }, [projectId, enabled, seq, client, setOffline]);
}

export function useSessionNotices(
  sessions: LocalSessionsResponse['sessions'] | undefined,
  notify: boolean,
  labels: { needsYou: string; finished: string },
  sink: AlertSink,
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

export function useAuthSession() {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    api<Session>('/api/session')
      .then(async (found) => {
        await ensureCsrf().catch(() => undefined);
        setSession(found);
      })
      .catch(() => setSession(null))
      .finally(() => setChecked(true));
  }, []);
  useEffect(() => {
    if (session && window.location.hash.startsWith('#pair='))
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [session]);
  const logout = async () => {
    try {
      await api('/api/logout', { method: 'POST', body: '{}' });
    } finally {
      markSignedOut(true);
      forgetCsrf();
      setSession(null);
      client.clear();
    }
  };
  return { session, setSession, checked, logout };
}

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
