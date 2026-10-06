import { useQuery } from '@tanstack/react-query';
import type { Agent, AttributedSession, LocalSessionsResponse } from '@aether/contracts';
import { api, type Session } from '../api.js';
import { LOCAL_PREFIX, SUBAGENT_INFIX, sessionIdOf } from '../localSessions.js';
import type { CharacterFacts, CharacterKind } from './character-actions.js';
import { idleSessions } from './clock-out.js';
import { heldByOther, type TerminalControl } from './terminal-driver.js';
import { useSessionTerminal, type Drive } from './use-drive.js';

/** A member made of a session, a subagent of one, or an agent AETHER manages. */
export const kindOf = (agentId: string): CharacterKind =>
  !agentId.startsWith(LOCAL_PREFIX)
    ? 'managed'
    : agentId.includes(SUBAGENT_INFIX)
      ? 'subagent'
      : 'observed';

/** The machine's sessions as the office last fetched them. Read-only: the app's own hook keeps them fresh. */
export function useCachedSessions(): readonly AttributedSession[] {
  const query = useQuery({
    queryKey: ['local-sessions'],
    queryFn: () => api<LocalSessionsResponse>('/api/local-sessions'),
    enabled: false,
  });
  return query.data?.sessions ?? [];
}

/** Who is signed in. */
export function useActor() {
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    staleTime: Infinity,
  });
  return { id: me.data?.actor.id ?? '', role: me.data?.actor.role ?? '' };
}

/** Which of these members are clock-out candidates (running, idle for a day or more, the kind the server would stop). */
export function clockOutKeys(
  sessions: readonly AttributedSession[],
  agentIds: readonly string[],
): string[] {
  const candidates = new Set(idleSessions(sessions, 1).map((s) => s.key));
  return agentIds.flatMap((id) => {
    const key = kindOf(id) === 'observed' ? sessionIdOf(id) : null;
    return key !== null && candidates.has(key) ? [key] : [];
  });
}

/**
 * The AETHER terminal a session runs in and whether it can be typed into now: none (not started in AETHER), free, held by
 * another person's lease, or stopped. Shares its queries with the composer, so the two never disagree.
 */
export function useTerminalState(session: AttributedSession | null, userId: string) {
  const { drive } = useSessionTerminal(session?.key ?? null);
  const control = useQuery({
    queryKey: ['drive-terminal', drive?.terminalId],
    queryFn: () =>
      api<TerminalControl>(`/api/projects/${drive!.projectId}/terminals/${drive!.terminalId}`),
    enabled: !!drive,
    refetchInterval: 3000,
    retry: false,
  });
  // Until the terminal's state is known it counts as free: a send checks it again and refuses when it is not.
  const state: CharacterFacts['drive'] = !drive
    ? 'none'
    : control.data && control.data.state !== 'running'
      ? 'stopped'
      : control.data && heldByOther(control.data, userId, Date.now())
        ? 'held'
        : 'free';
  return { drive: drive as Drive | null, state };
}

/** The sessions the office knows for these members, by agent id. */
export const sessionOf = (
  sessions: readonly AttributedSession[],
  agent: Pick<Agent, 'id'>,
): AttributedSession | null => {
  const key = kindOf(agent.id) === 'observed' ? sessionIdOf(agent.id) : null;
  return sessions.find((s) => s.key === key) ?? null;
};
