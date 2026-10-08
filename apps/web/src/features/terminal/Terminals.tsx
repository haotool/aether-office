import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TerminalKeys } from './TerminalKeys.js';
import { TerminalControls } from './TerminalControls.js';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { Empty } from '../../ui/Empty.js';
import { Field } from '../../ui/Field.js';
import { PageHeading } from '../../ui/PageHeading.js';
import { useT, useWhy } from '../../ui/useT.js';
import {
  AGENT_LABEL,
  profilesOf,
  type TerminalAccess,
  type TerminalAct,
  type TerminalDetail,
  type TerminalList,
  type TerminalProfile,
  type TerminalRow,
} from './terminal-model.js';
import { useSnapshotSync, useXterm } from './terminal-screen.js';
import { POLL, poll, pollBy } from '../../lib/app/polling.js';

type TerminalExit = { exitCode: number; signal: number | null };

/** The terminal's detail, polled until it has exited. */
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

/** One terminal's state: the polled detail, whether this person may type into it, the screen, and the commands. */
function useTerminalSession(projectId: string, id: string, userId: string, canWrite: boolean) {
  const [error, setError] = useState('');
  const [armed, setArmed] = useState(false);
  const [gap, setGap] = useState(false);
  const [exit, setExit] = useState<TerminalExit | null>(null);
  const query = useTerminalDetail(projectId, id);
  const access = useRef<TerminalAccess>({ enabled: false, epoch: 0 });
  const data = query.data;
  const writable =
    canWrite &&
    armed &&
    !query.error &&
    data?.state === 'running' &&
    data.controlOwner === userId &&
    (data.leaseUntil ?? 0) > Date.now();
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
  return { query, data, writable, act, error, gap, exit, host: screen.host, terminal };
}

function TerminalView(props: { projectId: string; id: string; userId: string; canWrite: boolean }) {
  const t = useT();
  const { projectId, id, userId, canWrite } = props;
  const { query, data, writable, act, error, gap, exit, host, terminal } = useTerminalSession(
    projectId,
    id,
    userId,
    canWrite,
  );
  return (
    <article className="panel">
      <p>
        {writable ? t('terminalControlled') : t('terminalReadOnly')} · {data?.state ?? t('loading')}
      </p>
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
      <div ref={host} className="terminal-screen" aria-label={t('terminals')} />
      {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
    </article>
  );
}

function ProfileSelect({ profiles }: { profiles: TerminalProfile[] }) {
  const t = useT();
  return (
    <Field label={t('terminalProfile')}>
      <select name="profile">
        {profiles.map((p) => (
          <option
            key={p.machineId + p.profile}
            value={JSON.stringify({ machineId: p.machineId, profile: p.profile })}
          >
            {p.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

type StartTerminalFormProps = {
  profiles: TerminalProfile[];
  canWrite: boolean;
  projectId: string;
  onStarted: (id: string) => Promise<void>;
};

function StartTerminalForm({ profiles, canWrite, projectId, onStarted }: StartTerminalFormProps) {
  const t = useT();
  const whyNot = useWhy();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async (form: HTMLFormElement) => {
    setBusy(true);
    setError('');
    const value = JSON.parse(String(new FormData(form).get('profile'))) as {
      machineId: string;
      profile: string;
    };
    try {
      const result = await execute('terminal.start', { ...value, cols: 80, rows: 24 }, projectId);
      await onStarted(String(result.result['id']));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TERMINAL_START_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void start(e.currentTarget);
        }}
      >
        <ProfileSelect profiles={profiles} />
        <button
          disabled={!canWrite || busy}
          {...whyNot([canWrite, 'needOperator'], [!busy, 'whyBusy'])}
        >
          {t('terminalStart')}
        </button>
      </form>
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
        <StartTerminalForm
          profiles={profiles}
          canWrite={canWrite}
          projectId={projectId}
          onStarted={async (id) => {
            setSelected(id);
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
        />
      )}{' '}
      {list.error && <p role="alert">{list.error.message}</p>}
    </>
  );
}
