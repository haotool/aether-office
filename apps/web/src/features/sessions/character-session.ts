import { useQuery } from '@tanstack/react-query';
import type { Agent, AttributedSession, LocalSessionsResponse } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { type Session } from '../../lib/api/api-session.js';
import { LOCAL_PREFIX, sessionIdOf } from '../../lib/sessions/session-names.js';
import { SUBAGENT_INFIX } from '../../lib/sessions/subagent-id.js';
import type { CharacterFacts, CharacterKind } from '../office/character-actions.js';
import { idleSessions } from '../operations/clock-out.js';
import { heldByOther, type TerminalControl } from '../terminal/terminal-driver.js';
import { useSessionTerminal, type Drive } from '../../hooks/use-drive.js';
import { POLL, poll } from '../../lib/app/polling.js';

export const kindOf = (agentId: string): CharacterKind =>
  !agentId.startsWith(LOCAL_PREFIX)
    ? 'managed'
    : agentId.includes(SUBAGENT_INFIX)
      ? 'subagent'
      : 'observed';

export function useCachedSessions(): readonly AttributedSession[] {
  const query = useQuery({
    queryKey: ['local-sessions'],
    queryFn: () => api<LocalSessionsResponse>('/api/local-sessions'),
    enabled: false,
  });
  return query.data?.sessions ?? [];
}

export function useActor() {
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    staleTime: Infinity,
  });
  return { id: me.data?.actor.id ?? '', role: me.data?.actor.role ?? '' };
}

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

export function useTerminalState(session: AttributedSession | null, userId: string) {
  const { drive } = useSessionTerminal(session?.key ?? null);
  const control = useQuery({
    queryKey: ['drive-terminal', drive?.terminalId],
    queryFn: () => {
      if (!drive) throw new Error('terminal control query without drive');
      return api<TerminalControl>(`/api/projects/${drive.projectId}/terminals/${drive.terminalId}`);
    },
    enabled: !!drive,
    ...poll(POLL.driving),
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

export const sessionOf = (
  sessions: readonly AttributedSession[],
  agent: Pick<Agent, 'id'>,
): AttributedSession | null => {
  const key = kindOf(agent.id) === 'observed' ? sessionIdOf(agent.id) : null;
  return sessions.find((s) => s.key === key) ?? null;
};
