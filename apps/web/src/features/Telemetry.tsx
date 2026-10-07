import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { bytes } from './GitHealth.js';
import type { LocalSession } from '@aether/contracts';
import { useT } from '../ui.js';
import { needsAttention } from '../localSessions.js';
import { ClaudeQuota } from './ClaudeQuota.js';

const TIME_ZONE = 'Asia/Taipei';
const format = (now: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(now);
const formatReset = (at: number) =>
  new Intl.DateTimeFormat('en-GB', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(at);
const pad = (n: number) => String(n).padStart(3, '0');

type System = {
  cpu: { busyPercent: number | null; cores: number; loadAverage: number[] };
  memory: { totalBytes: number; freeBytes: number };
  disks: { path: string; totalBytes: number; freeBytes: number }[];
};

/** One readout: a label, its value (flagged when it needs a look) and an optional tooltip. */
function Stat({
  label,
  warn = false,
  title,
  children,
}: {
  label: string;
  warn?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div title={title}>
      <dt>{label}</dt>
      <dd className={warn ? 'warn' : ''}>{children}</dd>
    </div>
  );
}

/** The newest Codex window anyone reported (Claude's windows come from <ClaudeQuota />). */
const newestCodexLimit = (sessions: readonly LocalSession[]) =>
  [...sessions]
    .filter((s) => s.provider === 'codex' && s.usage.limit)
    .sort((a, b) => b.mtime - a.mtime)[0]?.usage.limit;

function CodexStat({ sessions }: { sessions: readonly LocalSession[] }) {
  const t = useT();
  const codex = newestCodexLimit(sessions);
  const resets = codex?.resetsAt ? formatReset(codex.resetsAt) : null;
  const title = codex
    ? `${t('quotaReset')} ${resets ?? '—'}${codex.plan ? ` · ${codex.plan}` : ''}`
    : t('quotaUnknown');
  return (
    <Stat label="CODEX" title={title} warn={!!codex && codex.usedPercent >= 85}>
      {codex ? `${Math.round(codex.usedPercent)}%` : '—'}
    </Stat>
  );
}

/** The machine's CPU, memory and disk, read every few seconds from the control server. */
function SystemStats() {
  const t = useT();
  const system = useQuery({
    queryKey: ['system'],
    queryFn: () => api<System>('/api/system'),
    refetchInterval: 20000,
    retry: false,
  }).data;
  const memUsed = system ? 100 - (system.memory.freeBytes / system.memory.totalBytes) * 100 : null;
  const disk = system?.disks[0];
  const load = system?.cpu.loadAverage.map((n) => n.toFixed(1)).join(' / ');
  const busy = system?.cpu.busyPercent;
  return (
    <>
      <Stat
        label={t('cpu')}
        warn={(busy ?? 0) >= 85}
        title={system ? `load ${load} · ${system.cpu.cores} cores` : ''}
      >
        {busy == null ? '—' : `${Math.round(busy)}%`}
      </Stat>
      <Stat
        label={t('memory')}
        title={
          system
            ? `${bytes(system.memory.totalBytes - system.memory.freeBytes)} / ${bytes(system.memory.totalBytes)}`
            : ''
        }
      >
        {memUsed === null ? '—' : `${Math.round(memUsed)}%`}
      </Stat>
      <Stat
        label={t('disk')}
        warn={!!disk && disk.freeBytes / disk.totalBytes < 0.1}
        title={disk ? `${disk.path} · ${bytes(disk.totalBytes)}` : ''}
      >
        {disk ? bytes(disk.freeBytes) : '—'}
      </Stat>
    </>
  );
}

/** Readout in the top bar: how many local agent sessions exist, how many have a live process, and the time in Taipei. */
export function Telemetry({
  sessions,
  unread = 0,
}: {
  sessions: readonly LocalSession[];
  unread?: number;
}) {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  const live = sessions.filter((s) => s.process === 'running').length;
  const stale = sessions.filter(needsAttention).length;
  return (
    <dl className="telemetry" aria-label={t('telemetry')}>
      <Stat label={t('sessionCount')}>{pad(sessions.length)}</Stat>
      <Stat label={t('unread')} title={t('unreadHint')} warn={unread > 0}>
        {pad(unread)}
      </Stat>
      <Stat label={t('liveProcesses')}>{pad(live)}</Stat>
      <Stat label={t('staleCount')} title={t('staleHint')} warn={stale > 0}>
        {pad(stale)}
      </Stat>
      <CodexStat sessions={sessions} />
      <ClaudeQuota />
      <SystemStats />
      <Stat label="TPE">{format(now)}</Stat>
    </dl>
  );
}
