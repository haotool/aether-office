import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { bytes } from './GitHealth.js';
import type { LocalSession } from '@aether/contracts';
import { useT } from '../ui.js';

const TIME_ZONE = 'Asia/Taipei';
const format = (now: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(now);
const pad = (n: number) => String(n).padStart(3, '0');

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
  const system = useQuery({
    queryKey: ['system'],
    queryFn: () =>
      api<{
        cpu: { busyPercent: number | null; cores: number; loadAverage: number[] };
        memory: { totalBytes: number; freeBytes: number };
        disks: { path: string; totalBytes: number; freeBytes: number }[];
      }>('/api/system'),
    refetchInterval: 10000,
    retry: false,
  }).data;
  const memUsed = system ? 100 - (system.memory.freeBytes / system.memory.totalBytes) * 100 : null;
  const disk = system?.disks[0];
  // The newest Codex window anyone reported; Claude Code keeps no limit on disk, so it is shown as unknown.
  const codex = [...sessions]
    .filter((s) => s.provider === 'codex' && s.usage.limit)
    .sort((a, b) => b.mtime - a.mtime)[0]?.usage.limit;
  const resets = codex?.resetsAt
    ? new Intl.DateTimeFormat('en-GB', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIME_ZONE,
      }).format(codex.resetsAt)
    : null;
  return (
    <dl className="telemetry" aria-label={t('telemetry')}>
      <div>
        <dt>{t('sessionCount')}</dt>
        <dd>{pad(sessions.length)}</dd>
      </div>
      <div title={t('unreadHint')}>
        <dt>{t('unread')}</dt>
        <dd className={unread ? 'warn' : ''}>{pad(unread)}</dd>
      </div>
      <div>
        <dt>{t('liveProcesses')}</dt>
        <dd>{pad(live)}</dd>
      </div>
      <div
        title={
          codex
            ? `${t('quotaReset')} ${resets ?? '—'}${codex.plan ? ` · ${codex.plan}` : ''}`
            : t('quotaUnknown')
        }
      >
        <dt>CODEX</dt>
        <dd className={codex && codex.usedPercent >= 85 ? 'warn' : ''}>
          {codex ? `${Math.round(codex.usedPercent)}%` : '—'}
        </dd>
      </div>
      <div title={t('claudeQuotaUnknown')}>
        <dt>CLAUDE</dt>
        <dd>—</dd>
      </div>
      <div
        title={
          system
            ? `load ${system.cpu.loadAverage.map((n) => n.toFixed(1)).join(' / ')} · ${system.cpu.cores} cores`
            : ''
        }
      >
        <dt>{t('cpu')}</dt>
        <dd className={(system?.cpu.busyPercent ?? 0) >= 85 ? 'warn' : ''}>
          {system?.cpu.busyPercent == null ? '—' : `${Math.round(system.cpu.busyPercent)}%`}
        </dd>
      </div>
      <div
        title={
          system
            ? `${bytes(system.memory.totalBytes - system.memory.freeBytes)} / ${bytes(system.memory.totalBytes)}`
            : ''
        }
      >
        <dt>{t('memory')}</dt>
        <dd>{memUsed === null ? '—' : `${Math.round(memUsed)}%`}</dd>
      </div>
      <div title={disk ? `${disk.path} · ${bytes(disk.totalBytes)}` : ''}>
        <dt>{t('disk')}</dt>
        <dd className={disk && disk.freeBytes / disk.totalBytes < 0.1 ? 'warn' : ''}>
          {disk ? bytes(disk.freeBytes) : '—'}
        </dd>
      </div>
      <div>
        <dt>TPE</dt>
        <dd>{format(now)}</dd>
      </div>
    </dl>
  );
}
