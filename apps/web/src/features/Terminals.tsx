import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { TerminalKeys } from './TerminalKeys.js';
import { terminalSnapshotSchema } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, PageHeading, useT } from '../ui.js';
type TerminalRow = {
  id: string;
  profile: string;
  state: string;
  /** What the agent in it is doing, read from its screen; null when nothing is known. */
  agentState: 'working' | 'waiting' | 'idle' | 'unknown' | null;
  controlOwner: string | null;
  controlEpoch: number;
  leaseUntil: number | null;
};
type TerminalList = {
  sessions: TerminalRow[];
  profiles: { machineId: string; name: string; terminalProfiles: string }[];
};
const AGENT_LABEL = {
  working: 'terminalAgentWorking',
  waiting: 'terminalAgentWaiting',
  idle: 'terminalAgentIdle',
} as const;
function TerminalView({
  projectId,
  id,
  userId,
  canWrite,
}: {
  projectId: string;
  id: string;
  userId: string;
  canWrite: boolean;
}) {
  const t = useT();
  const [error, setError] = useState('');
  const [armed, setArmed] = useState(false);
  const [gap, setGap] = useState(false);
  const [exit, setExit] = useState<{ exitCode: number; signal: number | null } | null>(null);
  const query = useQuery({
    queryKey: ['terminal', projectId, id],
    queryFn: () =>
      api<
        TerminalRow & {
          snapshot: string | null;
          commands: { id: string; kind: string; state: string; result: string | null }[];
        }
      >(`/api/projects/${projectId}/terminals/${id}`),
    refetchInterval: (q) => (q.state.data?.state === 'exited' ? false : 250),
    retry: false,
  });
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const cursor = useRef(0);
  const access = useRef({ enabled: false, epoch: 0 });
  const data = query.data;
  const writable =
    canWrite &&
    armed &&
    !query.error &&
    data?.state === 'running' &&
    data.controlOwner === userId &&
    (data.leaseUntil ?? 0) > Date.now();
  useEffect(() => {
    access.current = { enabled: !!writable, epoch: data?.controlEpoch ?? 0 };
    if (terminal.current) terminal.current.options.disableStdin = !writable;
  }, [writable, data?.controlEpoch]);
  useEffect(() => {
    const term = new Terminal({
      cols: 80,
      rows: 24,
      scrollback: 1000,
      disableStdin: true,
      screenReaderMode: true,
      fontSize: 13,
      theme: { background: '#101923', foreground: '#edf2f7' },
    });
    terminal.current = term;
    term.open(host.current!);
    term.textarea?.setAttribute('aria-label', 'PTY input');
    // Terminal output cannot request clipboard access. No link-opening addon is loaded.
    const clipboard = term.parser.registerOscHandler(52, () => true);
    let buffer = '',
      timer: ReturnType<typeof setTimeout> | undefined,
      chain = Promise.resolve(),
      disposed = false;
    const flush = () => {
      timer = undefined;
      const text = buffer;
      buffer = '';
      if (!text || !access.current.enabled || disposed) return;
      const epoch = access.current.epoch;
      chain = chain
        .then(async () => {
          if (disposed || !access.current.enabled || access.current.epoch !== epoch) return;
          await execute('terminal.input', { terminalId: id, epoch, text }, projectId);
        })
        .catch((e) => {
          access.current.enabled = false;
          setArmed(false);
          setError(e instanceof Error ? e.message : 'TERMINAL_INPUT_UNKNOWN');
        });
    };
    const input = term.onData((text) => {
      if (!access.current.enabled) return;
      if (buffer.length + text.length > 8192) {
        setError('PTY_INPUT_LIMIT');
        return;
      }
      buffer += text;
      timer ??= setTimeout(flush, 50);
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      input.dispose();
      clipboard.dispose();
      term.dispose();
      terminal.current = null;
      cursor.current = 0;
    };
  }, [projectId, id]);
  useEffect(() => {
    if (!data?.snapshot || !terminal.current) return;
    try {
      const snapshot = terminalSnapshotSchema.parse(JSON.parse(data.snapshot));
      setExit(snapshot.exit);
      const first = snapshot.chunks[0]?.seq ?? snapshot.cursor + 1;
      if (cursor.current > snapshot.cursor || cursor.current < first - 1) {
        terminal.current.reset();
        cursor.current = 0;
        setGap(true);
      }
      if (snapshot.gap) setGap(true);
      terminal.current.resize(snapshot.dimensions.cols, snapshot.dimensions.rows);
      for (const chunk of snapshot.chunks)
        if (chunk.seq > cursor.current) terminal.current.write(chunk.data);
      cursor.current = snapshot.cursor;
    } catch {
      setError('TERMINAL_SNAPSHOT_INVALID');
    }
  }, [data?.snapshot]);
  async function act(
    type: 'terminal.takeover' | 'terminal.release' | 'terminal.stop' | 'terminal.resize',
    extra: Record<string, unknown> = {},
  ) {
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
  }
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
      <div className="form-actions">
        <button
          disabled={!canWrite || data?.state !== 'running'}
          onClick={() => void act('terminal.takeover')}
        >
          {t('terminalTakeover')}
        </button>
        <button disabled={!writable} onClick={() => void act('terminal.release')}>
          {t('terminalRelease')}
        </button>
        <button
          className="danger"
          disabled={!canWrite || !data || data.state === 'exited'}
          onClick={() => void act('terminal.stop')}
        >
          {t('terminalStop')}
        </button>
      </div>
      <form
        className="field-row"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void act('terminal.resize', {
            cols: Number(form.get('cols')),
            rows: Number(form.get('rows')),
          });
        }}
      >
        <Field label={t('terminalCols')}>
          <input name="cols" type="number" defaultValue={80} min={10} max={400} required />
        </Field>
        <Field label={t('terminalRows')}>
          <input name="rows" type="number" defaultValue={24} min={2} max={200} required />
        </Field>
        <button disabled={!writable}>{t('terminalResize')}</button>
      </form>
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['terminals', projectId],
    queryFn: () => api<TerminalList>(`/api/projects/${projectId}/terminals`),
    refetchInterval: 2000,
  });
  const profiles =
    list.data?.profiles.flatMap((m) =>
      (JSON.parse(m.terminalProfiles) as { name: string }[]).map((p) => ({
        machineId: m.machineId,
        profile: p.name,
        label: `${m.name} · ${p.name}`,
      })),
    ) ?? [];
  return (
    <>
      <PageHeading title={t('terminals')} subtitle={t('terminalNote')} />
      {profiles.length ? (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const value = JSON.parse(String(new FormData(e.currentTarget).get('profile'))) as {
              machineId: string;
              profile: string;
            };
            try {
              const result = await execute(
                'terminal.start',
                { ...value, cols: 80, rows: 24 },
                projectId,
              );
              setSelected(String(result.result['id']));
              await list.refetch();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'TERMINAL_START_FAILED');
            } finally {
              setBusy(false);
            }
          }}
        >
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
          <button disabled={!canWrite || busy}>{t('terminalStart')}</button>
        </form>
      ) : (
        <p>{t('terminalNoProfile')}</p>
      )}
      <div className="view-switch">
        {list.data?.sessions.map((s) => (
          <button key={s.id} onClick={() => setSelected(s.id)}>
            {s.profile} · {s.state}
            {s.state === 'running' && s.agentState && s.agentState !== 'unknown' && (
              <> · {t(AGENT_LABEL[s.agentState])}</>
            )}
            {' · '}
            {s.id.slice(0, 8)}
          </button>
        ))}
      </div>
      {selected && (
        <TerminalView
          key={selected}
          projectId={projectId}
          id={selected}
          userId={userId}
          canWrite={canWrite}
        />
      )}{' '}
      {(error || list.error) && <p role="alert">{error || list.error?.message}</p>}
    </>
  );
}
