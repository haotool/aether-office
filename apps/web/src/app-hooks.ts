import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { eventSchema, type LocalSessionsResponse } from '@aether/contracts';
import { activityOf, sessionIdOf } from './localSessions.js';
import { useSessionAlerts, type SessionEvent } from './notifications.js';
import {
  TOUR_INTERVAL_MS,
  idle,
  restoreFocus,
  tourFocus,
  tourReducer,
  type TourAction,
} from './tour.js';

/** The guided tour: its state and one `act` that also puts the camera focus back where the tour found it. */
export function useTour(focus: string, setFocus: (focus: string) => void) {
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
      try {
        eventSchema.parse(JSON.parse((e as MessageEvent).data));
        void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
      } catch {
        setOffline(true);
      }
    });
    stream.addEventListener('fault', () => {
      setOffline(true);
      void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
    });
    return () => stream.close();
  }, [projectId, enabled, seq, client, setOffline]);
}

/**
 * Sessions that started waiting for a human, or finished, since they were last looked at (keys). Raises the
 * notification too; selecting a session reads it.
 */
export function useUnreadSessions(
  sessions: LocalSessionsResponse['sessions'] | undefined,
  selectedId: string | null,
  notify: boolean,
  labels: { needsYou: string; finished: string },
): ReadonlySet<string> {
  const [unread, setUnread] = useState<ReadonlySet<string>>(new Set());
  const briefs = useMemo(
    () =>
      sessions?.map((s) => ({
        key: s.key,
        activity: activityOf(s, Date.now()),
        title: s.title ?? s.repo,
      })),
    [sessions],
  );
  const alertLabels = useMemo(
    () => ({ needsYou: labels.needsYou, finished: labels.finished }),
    [labels.needsYou, labels.finished],
  );
  const markUnread = useCallback(
    (events: SessionEvent[]) => setUnread((u) => new Set([...u, ...events.map((e) => e.key)])),
    [],
  );
  useSessionAlerts(briefs, notify, alertLabels, markUnread);
  useEffect(() => {
    const key = selectedId ? sessionIdOf(selectedId) : null;
    if (key && unread.has(key)) setUnread((u) => new Set([...u].filter((k) => k !== key)));
  }, [selectedId, unread]);
  return unread;
}
