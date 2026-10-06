import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AttributedSession } from '@aether/contracts';
import { activityOf, formatSpan } from '../localSessions.js';
import { usePreferences } from '../state.js';
import { Badge, Sheet, useT } from '../ui.js';

const ORDER = ['active', 'idle', 'dormant', 'orphaned'] as const;

/** Every session on the machine that has a live process, whatever its project: a chip with the count and a sheet to pick one. */
export function ActiveSessions({
  sessions,
  onOpen,
}: {
  sessions: readonly AttributedSession[];
  onOpen: (session: AttributedSession) => void;
}) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const [open, setOpen] = useState(false);
  const live = sessions
    .filter((s) => s.process === 'running')
    .sort(
      (a, b) =>
        ORDER.indexOf(a.liveness.state as (typeof ORDER)[number]) -
          ORDER.indexOf(b.liveness.state as (typeof ORDER)[number]) || b.mtime - a.mtime,
    );
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
            <li key={s.key}>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpen(s);
                }}
              >
                <span className="sheet-main">
                  <strong>{s.title ?? s.repo}</strong>
                  <small>
                    {s.repo}
                    {s.git?.branch ? ` · ${s.git.branch}` : ''}
                    {s.liveness.quietMs !== null
                      ? ` · ${formatSpan(s.liveness.quietMs, locale)}`
                      : ''}
                  </small>
                </span>
                <Badge state={activityOf(s, Date.now())} />
              </button>
            </li>
          ))}
          {!live.length && <li className="sheet-empty">{t('noActiveSessions')}</li>}
        </Sheet>
      )}
    </>
  );
}
