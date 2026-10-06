import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttributedSession } from '@aether/contracts';
import { api, execute, type Session } from '../api.js';
import { useT } from '../ui.js';

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
 * For a session AETHER only watches: start a new terminal in AETHER that resumes (or forks) it, through the same path as
 * the Terminals page (one tap, an owner or operator, the project's live execution on). The new session then shows here
 * with a composer. The original terminal is not touched and nothing is typed into it.
 */
export function ContinueInAether({
  session,
  projectId,
}: {
  session: AttributedSession;
  projectId: string;
}) {
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
    refetchInterval: 10_000,
    retry: false,
  });
  const allowed = ['owner', 'operator'].includes(me.data?.actor.role ?? '');
  const target = profileFor(list.data, session);
  const start = async (fork: boolean) => {
    if (!target) return;
    setBusy(true);
    setMessage('');
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
      setMessage(t('continueStarted'));
      await client.invalidateQueries({ queryKey: ['terminals', projectId] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'TERMINAL_START_FAILED');
    } finally {
      setBusy(false);
    }
  };
  if (!list.data) return null;
  if (!target) return <p>{t('continueNoProfile')}</p>;
  return (
    <>
      <p>{t(session.process === 'running' ? 'continueRunning' : 'continueNote')}</p>
      <div className="session-footer-actions">
        <button
          disabled={!allowed || busy || session.process === 'running'}
          onClick={() => void start(false)}
        >
          {t('continueHere')}
        </button>
        <button className="secondary" disabled={!allowed || busy} onClick={() => void start(true)}>
          {t('forkHere')}
        </button>
      </div>
      {!allowed && <p>{t('continueRole')}</p>}
      {message && <p role="status">{message}</p>}
    </>
  );
}
