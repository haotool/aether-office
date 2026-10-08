import { useEffect, useRef } from 'react';
import {
  planAlerts,
  sessionTransitions,
  type Brief,
  type Delivery,
  type Permission,
} from './alert-rules.js';

export type PendingApproval = { id: string; state: string; kind: string };
/** Where an alert goes when it cannot be a browser notification, and what a tap on it opens. */
export type AlertSink = { toast: (text: string) => void; open: (to: string) => void };

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
export const permissionNow = (): Permission =>
  notificationsSupported() ? Notification.permission : 'unsupported';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  return (await Notification.requestPermission()) === 'granted';
}

/**
 * Alerts are on by default, but the browser's permission prompt is never raised by itself: the first click or key press
 * in the page (a user gesture) asks once. Until it is granted, alerts are shown inside the page.
 */
export function useNotificationPermission(enabled: boolean) {
  useEffect(() => {
    if (!enabled || permissionNow() !== 'default') return;
    const stop = () => {
      window.removeEventListener('pointerdown', ask);
      window.removeEventListener('keydown', ask);
    };
    const ask = () => {
      stop();
      void requestNotificationPermission();
    };
    window.addEventListener('pointerdown', ask);
    window.addEventListener('keydown', ask);
    return stop;
  }, [enabled]);
}

/** Shows an alert as a browser notification (a tap opens its page) or, without permission, as an in-page notice. */
function deliver(d: Delivery, sink: AlertSink) {
  if (d.via === 'toast') return sink.toast(`${d.title}: ${d.body}`);
  const n = new Notification(d.title, { body: d.body, tag: d.tag, silent: true });
  n.onclick = () => {
    window.focus();
    sink.open(d.to);
    n.close();
  };
}

export function useApprovalNotifications(
  projectId: string | undefined,
  approvals: readonly PendingApproval[] | undefined,
  enabled: boolean,
  alert: { title: string; project: string },
  sink: AlertSink,
) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!enabled) {
      seen.current = null;
      return;
    }
    if (!approvals) return;
    const result = newlyPending(seen.current, approvals);
    seen.current = result.seen;
    for (const approval of result.fresh)
      deliver(
        {
          tag: approval.id,
          title: alert.title,
          body: alert.project,
          to: `/approvals?project=${projectId}`,
          via: permissionNow() === 'granted' ? 'native' : 'toast',
        },
        sink,
      );
  }, [enabled, approvals, alert.title, alert.project, projectId, sink]);
}

/** Raises the alerts planned for what changed in the local sessions. */
export function useSessionAlerts(
  sessions: readonly Brief[] | undefined,
  notify: boolean,
  labels: { needsYou: string; finished: string },
  sink: AlertSink,
) {
  const states = useRef<ReturnType<typeof sessionTransitions>['states'] | null>(null);
  useEffect(() => {
    if (!sessions) return;
    const result = sessionTransitions(states.current, sessions, Date.now());
    states.current = result.states;
    if (!result.events.length) return;
    const context = {
      notify,
      hidden: document.visibilityState === 'hidden',
      permission: permissionNow(),
    };
    for (const d of planAlerts(result.events, context, labels)) deliver(d, sink);
  }, [sessions, notify, labels, sink]);
}
