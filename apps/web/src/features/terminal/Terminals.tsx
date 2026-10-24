import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TerminalKeys } from './TerminalKeys.js';
import { TerminalControls } from './TerminalControls.js';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { Empty } from '../../ui/Empty.js';
import { PageHeading } from '../../ui/PageHeading.js';
import { useT, useWhy } from '../../ui/useT.js';
import {
  AGENT_LABEL,
  profileTitle,
  profilesOf,
  terminalHint,
  type TerminalAccess,
  type TerminalAct,
  type TerminalDetail,
  type TerminalList,
  type TerminalProfile,
  type TerminalRow,
} from './terminal-model.js';
import { useSnapshotSync, useXterm } from './terminal-screen.js';
import { RENEW_TICK_MS, needsRenewal, sizeOf } from './terminal-lease.js';
import { holdsLease, takeable } from './terminal-driver.js';
import { POLL, poll, pollBy } from '../../lib/app/polling.js';
import { useLatest } from '../../hooks/use-latest.js';

type TerminalExit = { exitCode: number; signal: number | null };

function useTerminalDetail(projectId: string, id: string) {
  return useQuery({
    queryKey: ['terminal', projectId, id],
    queryFn: () => api<TerminalDetail>(`/api/projects/${projectId}/terminals/${id}`),
    ...pollBy((data: TerminalDetail | undefined) =>
      data?.state === 'exited' ? false : POLL.screen,
    ),
    retry: false,
  });
}

type TerminalViewProps = {
  projectId: string;
  id: string;
  userId: string;
  canWrite: boolean;
  fresh: boolean;
};

/** Takes the keyboard for a conversation that was just started, and renews the lease while the screen has focus. */
function useLease(lease: {
  terminal: { current: { focus: () => void } | null };
  fresh: boolean;
  writable: boolean;
  data: TerminalDetail | undefined;
  act: TerminalAct;
}) {
  const { terminal, fresh, writable, data } = lease;
  const [focused, setFocused] = useState(false);
  const started = useRef(false);
  const latest = useLatest({ data, act: lease.act });
  useEffect(() => {
    if (!fresh || started.current || data?.state !== 'running') return;
    started.current = true;
    terminal.current?.focus();
  }, [fresh, data?.state, terminal]);
  useEffect(() => {
    if (!writable || !focused) return;
    const timer = setInterval(() => {
      const { data: current, act } = latest.current;
      if (current && needsRenewal(current.leaseUntil, Date.now()))
        void act('terminal.resize', sizeOf(current.snapshot));
    }, RENEW_TICK_MS);
    return () => clearInterval(timer);
  }, [writable, focused, latest]);
  return setFocused;
}

function useTerminalSession({ projectId, id, userId, canWrite, fresh }: TerminalViewProps) {
  const [error, setError] = useState('');
  const [armed, setArmed] = useState(false);
  const [gap, setGap] = useState(false);
  const [exit, setExit] = useState<TerminalExit | null>(null);
  const query = useTerminalDetail(projectId, id);
  const access = useRef<TerminalAccess>({ enabled: false, epoch: 0 });
  const data = query.data;
  const writable =
    canWrite && armed && !query.error && !!data && holdsLease(data, userId, Date.now());
  const screen = useXterm(
    projectId,
    id,
    access,
    (message) => {
      setArmed(false);
      setError(message);
    },
    setError,
  );
  const { terminal } = screen;
  useEffect(() => {
    access.current = { enabled: !!writable, epoch: data?.controlEpoch ?? 0 };
    if (terminal.current) terminal.current.options.disableStdin = !writable;
  }, [writable, data?.controlEpoch, terminal]);
  useSnapshotSync(data?.snapshot, screen, {
    exit: setExit,
    gap: () => setGap(true),
    error: setError,
  });
  const act: TerminalAct = async (type, extra = {}) => {
    if (!data) return;
    setError('');
    try {
      await execute(type, { terminalId: id, epoch: data.controlEpoch, ...extra }, projectId);
      setArmed(type === 'terminal.takeover' || (type === 'terminal.resize' && armed));
      await query.refetch();
      if (type === 'terminal.takeover') terminal.current?.focus();
    } catch (e) {
      setArmed(false);
      setError(e instanceof Error ? e.message : 'TERMINAL_COMMAND_FAILED');
    }
  };
  const setFocused = useLease({ terminal, fresh, writable, data, act });
  return { query, data, writable, act, error, gap, exit, setFocused, host: screen.host, terminal };
}

function TerminalView(props: TerminalViewProps) {
  const t = useT();
  const { userId, canWrite } = props;
  const { query, data, writable, act, error, gap, exit, setFocused, host, terminal } =
    useTerminalSession(props);
  return (
    <article className="panel">
      <p>{t(terminalHint(data, writable, userId, Date.now()))}</p>
      <p className="muted">{t('terminalInputNote')}</p>
      {gap && <p role="status">{t('terminalGap')}</p>}
      {data?.commands[0] && (
        <p>
          {t('terminalCommandState')}: {data.commands[0].kind} · {data.commands[0].state}
        </p>
      )}
      <TerminalControls canWrite={canWrite} writable={writable} data={data} act={act} />
      {exit && (
        <p>
          Exit code: {exit.exitCode} · Signal: {exit.signal ?? '—'}
        </p>
      )}
      {writable && <TerminalKeys onKey={(sequence) => terminal.current?.input(sequence)} />}
      <div
        ref={host}
        className="terminal-screen"
        aria-label={t('terminals')}
        onFocus={() => {
          setFocused(true);
          if (canWrite && !writable && data && takeable(data, userId, Date.now()))
            void act('terminal.takeover');
        }}
        onBlur={() => setFocused(false)}
      />
      {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
    </article>
  );
}

type StartTerminalProps = {
  profiles: TerminalProfile[];
  canWrite: boolean;
  projectId: string;
  onStarted: (id: string) => Promise<void>;
};

function StartTerminalButtons({ profiles, canWrite, projectId, onStarted }: StartTerminalProps) {
  const t = useT();
  const whyNot = useWhy();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async (p: TerminalProfile) => {
    setBusy(true);
    setError('');
    try {
      const result = await execute(
        'terminal.start',
        { machineId: p.machineId, profile: p.profile, cols: 80, rows: 24 },
        projectId,
      );
      await onStarted(String(result.result['id']));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TERMINAL_START_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="form-actions">
        {profiles.map((p) => (
          <button
            key={p.machineId + p.profile}
            disabled={!canWrite || busy}
            {...whyNot([canWrite, 'needOperator'], [!busy, 'whyBusy'])}
            onClick={() => void start(p)}
          >
            {t('terminalNewConversation')} · {profileTitle(p.profile)}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function SessionButtons({
  sessions,
  onSelect,
}: {
  sessions: TerminalRow[] | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="view-switch">
      {sessions?.map((s) => (
        <button key={s.id} onClick={() => onSelect(s.id)}>
          {s.profile} · {s.state}
          {s.state === 'running' && s.agentState && s.agentState !== 'unknown' && (
            <> · {t(AGENT_LABEL[s.agentState])}</>
          )}
          {' · '}
          {s.id.slice(0, 8)}
        </button>
      ))}
    </div>
  );
}

export function Terminals({
  projectId,
  userId,
  canWrite,
}: {
  projectId: string;
  userId: string;
  canWrite: boolean;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['terminals', projectId],
    queryFn: () => api<TerminalList>(`/api/projects/${projectId}/terminals`),
    ...poll(POLL.watching),
  });
  const profiles = profilesOf(list.data?.profiles);
  return (
    <>
      <PageHeading title={t('terminals')} subtitle={t('terminalNote')} />
      {profiles.length ? (
        <StartTerminalButtons
          profiles={profiles}
          canWrite={canWrite}
          projectId={projectId}
          onStarted={async (id) => {
            setSelected(id);
            setFresh(id);
            await list.refetch();
          }}
        />
      ) : (
        <Empty title={t('terminalNoProfileTitle')} hint={t('terminalNoProfile')} />
      )}
      <SessionButtons sessions={list.data?.sessions} onSelect={setSelected} />
      {selected && (
        <TerminalView
          key={selected}
          projectId={projectId}
          id={selected}
          userId={userId}
          canWrite={canWrite}
          fresh={fresh === selected}
        />
      )}{' '}
      {list.error && <p role="alert">{list.error.message}</p>}
    </>
  );
}
