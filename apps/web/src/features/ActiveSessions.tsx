import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AttributedSession } from '@aether/contracts';
import { activityOf } from '../session-attention.js';
import { formatSpan } from '@aether/kernel';
import { rowLabelOf } from '../session-names.js';
import { Badge } from '../ui/Badge.js';
import { Sheet } from '../ui/Modal.js';
import { useT, useLocale } from '../ui/useT.js';

const ORDER = ['active', 'idle', 'dormant', 'orphaned'] as const;

type ActiveSessionsProps = {
  sessions: readonly AttributedSession[];
  onOpen: (session: AttributedSession) => void;
};

/** The sessions with a live process: the most alive first, then the most recently written. */
function runningSessions(sessions: readonly AttributedSession[]) {
  return sessions
    .filter((s) => s.process === 'running')
    .sort(
      (a, b) =>
        ORDER.indexOf(a.liveness.state as (typeof ORDER)[number]) -
          ORDER.indexOf(b.liveness.state as (typeof ORDER)[number]) || b.mtime - a.mtime,
    );
}

function LiveRow({ s, onPick }: { s: AttributedSession; onPick: () => void }) {
  const locale = useLocale();
  return (
    <li>
      <button onClick={onPick}>
        <span className="sheet-main">
          <strong title={s.title ?? s.repo}>{rowLabelOf(s)}</strong>
          <small>
            {s.repo}
            {s.git?.branch ? ` · ${s.git.branch}` : ''}
            {s.liveness.quietMs !== null ? ` · ${formatSpan(s.liveness.quietMs, locale)}` : ''}
          </small>
        </span>
        <Badge state={activityOf(s, Date.now())} />
      </button>
    </li>
  );
}

/** Every session on the machine that has a live process, whatever its project: a chip with the count and a sheet to pick one. */
export function ActiveSessions({ sessions, onOpen }: ActiveSessionsProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const live = runningSessions(sessions);
  return (
    <>
      <button
        className="chip-active"
        aria-expanded={open}
        aria-label={`${t('activeSessions')}: ${live.length}`}
        onClick={() => setOpen(true)}
      >
        <i aria-hidden="true" className={live.length ? 'on' : ''} />
        <span className="chip-label">{t('chipRunning')}</span>
        {live.length}
      </button>
      {open && (
        <Sheet
          title={t('activeSessions')}
          count={live.length}
          onClose={() => setOpen(false)}
          action={
            <Link to="/sessions" onClick={() => setOpen(false)}>
              {t('sessionsPage')}
            </Link>
          }
        >
          {live.map((s) => (
            <LiveRow
              key={s.key}
              s={s}
              onPick={() => {
                setOpen(false);
                onOpen(s);
              }}
            />
          ))}
          {!live.length && <li className="sheet-empty">{t('noActiveSessions')}</li>}
        </Sheet>
      )}
    </>
  );
}
