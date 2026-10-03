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
