import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

type PendingApproval = { id: string; state: string; kind: string };

/** Ids that are pending now and were not seen before; the first call only records what exists. */
export function newlyPending(
  seen: ReadonlySet<string> | null,
  approvals: readonly PendingApproval[],
): { fresh: PendingApproval[]; seen: Set<string> } {
  const pending = approvals.filter((a) => a.state === 'pending');
  const next = new Set([...(seen ?? []), ...pending.map((a) => a.id)]);
  return { fresh: seen === null ? [] : pending.filter((a) => !seen.has(a.id)), seen: next };
}

export const notificationsSupported = () => typeof Notification !== 'undefined';

/** Off by default. Never asks for permission by itself: only the explicit toggle does. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function useApprovalNotifications(
  projectId: string | undefined,
  enabled: boolean,
  title: string,
) {
  const seen = useRef<Set<string> | null>(null);
  const query = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: () => api<PendingApproval[]>(`/api/projects/${projectId}/approvals`),
    enabled: enabled && !!projectId,
    refetchInterval: 5000,
  });
  useEffect(() => {
    if (!enabled) {
      seen.current = null;
      return;
    }
    if (!query.data) return;
    const result = newlyPending(seen.current, query.data);
    seen.current = result.seen;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const approval of result.fresh)
      new Notification(title, { body: approval.kind, tag: approval.id });
  }, [enabled, query.data, title]);
}

export type SessionEvent = { key: string; kind: 'needs-you' | 'finished'; title: string };
type Brief = { key: string; activity: string; title: string };

/**
 * Pure. What changed since the last look: a session that now waits for a human, or one that stopped working.
 * The first call only records the current states, so opening the page never floods notifications.
 */
export function sessionTransitions(
  before: ReadonlyMap<string, string> | null,
  sessions: readonly Brief[],
): { events: SessionEvent[]; states: Map<string, string> } {
  const states = new Map(sessions.map((s) => [s.key, s.activity]));
  if (before === null) return { events: [], states };
  const events: SessionEvent[] = [];
  for (const s of sessions) {
    const was = before.get(s.key);
    if (was === undefined || was === s.activity) continue;
    if (s.activity === 'waiting_permission')
      events.push({ key: s.key, kind: 'needs-you', title: s.title });
    else if (was === 'working' && (s.activity === 'idle' || s.activity === 'offline'))
      events.push({ key: s.key, kind: 'finished', title: s.title });
  }
  return { events, states };
}

/** Marks sessions that need attention as unread, and shows a browser notification when the user enabled them. */
export function useSessionAlerts(
  sessions: readonly Brief[] | undefined,
  notify: boolean,
  labels: { needsYou: string; finished: string },
  onEvents: (events: SessionEvent[]) => void,
) {
  const states = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!sessions) return;
    const result = sessionTransitions(states.current, sessions);
    states.current = result.states;
    if (!result.events.length) return;
    onEvents(result.events);
    if (!notify || typeof Notification === 'undefined' || Notification.permission !== 'granted')
      return;
    for (const e of result.events)
      new Notification(e.kind === 'needs-you' ? labels.needsYou : labels.finished, {
        body: e.title,
        tag: `${e.kind}:${e.key}`,
      });
  }, [sessions, notify, labels, onEvents]);
}
