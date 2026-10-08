import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttributedSession } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { type Session } from '../../lib/api/api-session.js';
import { useT } from '../../ui/useT.js';
import { isOperator } from '../../lib/navigation/roles.js';
import { POLL, poll } from '../../lib/app/polling.js';

type Profile = { name: string; root: string };
type TerminalList = {
  profiles: { machineId: string; name: string; terminalProfiles: string }[];
};

/** The profile that runs this session's provider in this session's folder, on a machine that is up. */
function profileFor(list: TerminalList | undefined, session: AttributedSession) {
  for (const machine of list?.profiles ?? []) {
    const found = (JSON.parse(machine.terminalProfiles) as Profile[]).find(
      (p) => p.name.startsWith(`${session.provider}-`) && p.root === session.cwd,
    );
    if (found) return { machineId: machine.machineId, profile: found.name };
  }
  return null;
}

/**
 * Starting a new AETHER terminal that resumes (or forks) a session AETHER only watches: through the same path as the
 * Terminals page (one tap, an owner or operator, the project's live execution on). The original terminal is not touched
 * and nothing is typed into it. Shared by the conversation's foot and the character menu.
 */
export function useContinue(session: AttributedSession | null, projectId: string) {
  const t = useT();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const me = useQuery({
    queryKey: ['session'],
    queryFn: () => api<Session>('/api/session'),
    staleTime: Infinity,
  });
  const list = useQuery({
    queryKey: ['terminals', projectId],
    queryFn: () => api<TerminalList>(`/api/projects/${projectId}/terminals`),
    ...poll(POLL.idle),
    retry: false,
    enabled: !!session,
  });
  const allowed = isOperator(me.data?.actor.role);
  const target = session ? profileFor(list.data, session) : null;
  /** Starts the terminal; says what happened (the same line `message` holds). */
  const start = async (fork: boolean): Promise<string> => {
    if (!target || !session) return '';
    setBusy(true);
    setMessage('');
    let done = '';
    try {
      await execute(
        'terminal.start',
        {
          ...target,
          cols: 100,
          rows: 30,
          resume: { provider: session.provider, sessionId: session.sessionId, fork },
        },
        projectId,
      );
      done = t('continueStarted');
      await client.invalidateQueries({ queryKey: ['terminals', projectId] });
    } catch (e) {
      done = e instanceof Error ? e.message : 'TERMINAL_START_FAILED';
    } finally {
      setMessage(done);
      setBusy(false);
    }
    return done;
  };
  return { loaded: !!list.data, allowed, target, busy, message, start };
}
