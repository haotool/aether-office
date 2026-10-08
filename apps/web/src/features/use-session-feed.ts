import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AttributedSession } from '@aether/contracts';
import { api } from '../api.js';
import { useLatest } from '../use-latest.js';
import { sessionsToAgents } from '../localSessions.js';
import { buildFeed, feedItems, type Feed, type Speech } from './feed-model.js';
import { groupFeed } from './feed-squads.js';
import { pollMs } from './live-link.js';
import { askingKeys, usePermissionRequests } from './permission-requests.js';
import { useLinkLive } from './use-session-stream.js';
import { holdBaseline, releaseBaseline, useSeen } from './session-seen.js';
import { useLocale } from '../ui/useT.js';

const SPEECH_POLL_MS = 6000;

/**
 * The last prompt and reply of every running session, by session key. One query shared by the speech bubbles in the
 * scene and the feed in the panel. While the change stream is live it refetches when a session speaks; otherwise it is
 * polled, only while the page is visible and there is someone to show. Undefined until the first answer.
 */
export function useSpeechBySession(enabled: boolean): Record<string, Speech> | undefined {
  const live = useLinkLive();
  const query = useQuery({
    queryKey: ['speech'],
    queryFn: () =>
      api<{ speech: Record<string, Speech> }>('/api/local-sessions/speech').then((r) => r.speech),
    enabled,
    refetchInterval: pollMs(live, SPEECH_POLL_MS),
    refetchIntervalInBackground: false,
    retry: false,
  });
  return query.data;
}

/**
 * The panel's feed. Opening a session (selecting it, and while it stays selected) marks it read. A new event in some
 * other session only changes the feed and its counts; it never changes what is selected.
 */
export function useSessionFeed(
  all: readonly AttributedSession[] | undefined,
  selectedKey: string | null,
): Feed {
  const locale = useLocale();
  // Every session that belongs to a project: the office cannot show one that does not.
  const sessions = useMemo(() => (all ?? []).filter((s) => s.projectId !== null), [all]);
  const speech = useSpeechBySession(sessions.length > 0);
  const { seen, markSeen } = useSeen();
  const requests = usePermissionRequests();
  const asking = useMemo(() => askingKeys(requests), [requests]);
  const feed = useMemo(() => {
    const now = Date.now();
    const agents = sessionsToAgents(sessions, '', now, locale);
    return groupFeed(buildFeed({ sessions, agents, speech, seen, now, asking }), now);
  }, [sessions, locale, speech, seen, asking]);
  // First, before the effect below marks it seen: what "last looked" was as this visit began.
  const seenNow = useLatest(seen); // read at the moment of selection: a later change to `seen` must not move it
  useEffect(() => {
    if (!selectedKey) return;
    holdBaseline(selectedKey, seenNow.current[selectedKey] ?? 0);
    return () => void releaseBaseline(selectedKey);
  }, [selectedKey, seenNow]);
  const openedAt = feedItems(feed).find((i) => i.key === selectedKey)?.at;
  useEffect(() => {
    if (selectedKey && openedAt !== undefined) markSeen(selectedKey, openedAt);
  }, [selectedKey, openedAt, markSeen]);
  return feed;
}
