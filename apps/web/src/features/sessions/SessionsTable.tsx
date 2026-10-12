import { useNavigate } from 'react-router-dom';
import type { AttributedSession, LocalSession } from '@aether/contracts';
import { ROLE_LABELS, formatSpan, type RoleId } from '@aether/kernel';
import { activityOf } from '../../lib/sessions/session-attention.js';
import { sessionCommands } from '../../lib/sessions/localSessions.js';
import { sessionLink } from '../../lib/sessions/session-names.js';
import { useT } from '../../ui/useT.js';
import { contextLabel } from './context-label.js';
import { LIVENESS_LABEL } from './sessions-filter.js';

type Locale = 'zh-TW' | 'en';

const zombieTitle = (zombies: LocalSession['liveness']['zombies'], hint: string) =>
  `${zombies.map((z) => `${z.program ?? '?'} (pid ${z.pid})`).join(', ')}\n${hint}`;

function LivenessNote({ s, now, locale }: { s: AttributedSession; now: number; locale: Locale }) {
  const t = useT();
  const { liveness } = s;
  return (
    <small className={`liveness ${liveness.state}`}>
      {t(LIVENESS_LABEL[liveness.state])}
      {liveness.quietMs !== null && (
        <>
          {' · '}
          {t('quietFor')} {formatSpan(liveness.quietMs, locale)}
        </>
      )}
      {liveness.zombies.length > 0 && (
        <>
          {' · '}
          <span title={zombieTitle(liveness.zombies, t('zombieHint'))}>
            {t('livenessZombie')} ×{liveness.zombies.length}
          </span>
        </>
      )}
      {liveness.startedAt !== null && (
        <>
          {' · '}
          {t('runningFor')} {formatSpan(now - liveness.startedAt, locale)}
        </>
      )}
    </small>
  );
}

function PreviewLinks({ ports }: { ports: readonly number[] }) {
  if (!ports.length) return <>—</>;
  return (
    <>
      {ports.map((port) => (
        <a key={port} href={`http://localhost:${port}`} target="_blank" rel="noopener noreferrer">
          :{port}
        </a>
      ))}
    </>
  );
}

export type RowActions = {
  canStop: boolean;
  copied: string;
  reaped: Record<string, string>;
  onCopy: (text: string, id: string) => void;
  onReap: (s: AttributedSession) => void;
  onStop: (s: AttributedSession) => void;
};

function SessionActions({ s, actions }: { s: AttributedSession; actions: RowActions }) {
  const t = useT();
  const navigate = useNavigate();
  const { canStop, copied, reaped, onCopy, onReap, onStop } = actions;
  const commands = sessionCommands(s);
  return (
    <td className="actions">
      <button className="secondary" onClick={() => navigate(sessionLink(s))}>
        {t('showInOffice')}
      </button>
      <button className="secondary" onClick={() => onCopy(commands.resume, `${s.key}:r`)}>
        {copied === `${s.key}:r` ? t('copied') : t('copyResume')}
      </button>
      <button className="secondary" onClick={() => onCopy(commands.fork, `${s.key}:f`)}>
        {copied === `${s.key}:f` ? t('copied') : t('copyFork')}
      </button>
      {canStop && s.process === 'running' && s.liveness.zombies.length > 0 && (
        <button className="secondary" title={t('zombieHint')} onClick={() => onReap(s)}>
          {reaped[s.key] ?? t('reapZombies')}
        </button>
      )}
      {canStop && ['dormant', 'orphaned'].includes(s.liveness.state) && (
        <button className="secondary danger" onClick={() => onStop(s)}>
          {t('stopAction')}
        </button>
      )}
    </td>
  );
}

function SessionRow({
  s,
  now,
  locale,
  actions,
}: {
  s: AttributedSession;
  now: number;
  locale: Locale;
  actions: RowActions;
}) {
  const t = useT();
  const role = ROLE_LABELS[s.classification.role as RoleId];
  const window = s.usage.contextPct === null ? null : Math.round(s.usage.contextPct);
  return (
    <tr>
      <td title={s.cwd}>
        <b>{s.provider === 'codex' ? 'CX' : 'CL'}</b>{' '}
        {s.title ?? (s.cwd.split('/').pop() || s.repo)}
        <small>{s.repo}</small>
      </td>
      <td data-label={t('jobRole')}>
        {role ? (locale === 'zh-TW' ? role.zh : role.en) : s.classification.role}
      </td>
      <td data-label={t('status')}>
        {activityOf(s, now)} · {s.process}
        {s.liveness.state !== 'unknown' && <LivenessNote s={s} now={now} locale={locale} />}
        {s.resources && (
          <small>
            {s.resources.cpuPercent.toFixed(0)}% · {Math.round(s.resources.rssBytes / 1e6)} MB
          </small>
        )}
      </td>
      <td data-label={t('model')}>
        {s.usage.model ?? '—'}
        {window !== null && (
          <small title={contextLabel(s.usage, t, locale) ?? undefined}>ctx {window}%</small>
        )}
      </td>
      <td data-label={t('gitBranch')}>{s.git?.branch ?? (s.git ? 'detached' : '—')}</td>
      <td data-label={t('preview')}>
        <PreviewLinks ports={s.ports} />
      </td>
      <SessionActions s={s} actions={actions} />
    </tr>
  );
}

export function SessionsTable({
  rows,
  locale,
  actions,
}: {
  rows: readonly AttributedSession[];
  locale: Locale;
  actions: RowActions;
}) {
  const t = useT();
  const now = Date.now();
  return (
    <div className="table-scroll" tabIndex={0} aria-label={t('sessionsPage')}>
      <table className="stack">
        <thead>
          <tr>
            <th>{t('sessionTitle')}</th>
            <th>{t('jobRole')}</th>
            <th>{t('status')}</th>
            <th>{t('model')}</th>
            <th>{t('gitBranch')}</th>
            <th>{t('preview')}</th>
            <th>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <SessionRow key={s.key} s={s} now={now} locale={locale} actions={actions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
