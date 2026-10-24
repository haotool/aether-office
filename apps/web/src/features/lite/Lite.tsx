import { useMemo } from 'react';
import type { Application } from '../../lib/app/app-state.js';
import { useSessionTerminal } from '../../hooks/use-drive.js';
import { rowLabelOf } from '../../lib/sessions/session-names.js';
import { Badge } from '../../ui/Badge.js';
import { ReasonDefs } from '../../ui/ReasonDefs.js';
import { useT } from '../../ui/useT.js';
import { TranscriptView } from '../conversation/TranscriptView.js';
import { PermissionCards } from '../operations/PermissionCard.js';
import { NeedBanner } from '../shell-chrome/NeedBanner.js';
import { asksOf } from '../shell-chrome/need-banner.js';
import { Composer } from '../terminal/Composer.js';
import { liteRows } from './lite-rows.js';

const SESSION_PARAM = 's';

export function Lite({ app }: { app: Application }) {
  const { params, setParams } = app.sel;
  const sessions = app.local.data?.sessions;
  const open = (key: string | null) =>
    setParams(
      (p) => {
        if (key) p.set(SESSION_PARAM, key);
        else p.delete(SESSION_PARAM);
        return p;
      },
      { replace: !key },
    );
  const key = params.get(SESSION_PARAM);
  const session = sessions?.find((s) => s.key === key) ?? null;
  return (
    <div className="lite">
      <ReasonDefs />
      <NeedBanner sessions={sessions} asking={app.asking} notify={app.prefs.notify} onOpen={open} />
      {session ? (
        <LiteChat app={app} sessionKey={session.key} onBack={() => open(null)} />
      ) : (
        <LiteList app={app} onOpen={open} />
      )}
    </div>
  );
}

function LiteList({ app, onOpen }: { app: Application; onOpen: (key: string) => void }) {
  const t = useT();
  const sessions = app.local.data?.sessions;
  const rows = useMemo(() => {
    const now = Date.now();
    return liteRows(sessions, asksOf(sessions, app.asking, rowLabelOf, now), now);
  }, [sessions, app.asking]);
  if (!rows.length) return <p className="lite-empty">{t('liteEmpty')}</p>;
  return (
    <ul className="lite-list">
      {rows.map(({ session, asking, activity }) => (
        <li key={session.key}>
          <button className="lite-row" data-asking={asking} onClick={() => onOpen(session.key)}>
            <strong>{rowLabelOf(session)}</strong>
            {asking ? (
              <span className="lite-needs">{t('needBannerNeeds')}</span>
            ) : (
              <Badge state={activity} />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function LiteChat({
  app,
  sessionKey,
  onBack,
}: {
  app: Application;
  sessionKey: string;
  onBack: () => void;
}) {
  const t = useT();
  const { drive } = useSessionTerminal(sessionKey);
  const session = app.local.data?.sessions.find((s) => s.key === sessionKey);
  if (!session) return null;
  const working = session.hook?.activity === 'working';
  return (
    <div className="lite-chat">
      <header>
        <button className="secondary" onClick={onBack}>
          {t('liteBack')}
        </button>
        <strong>{rowLabelOf(session)}</strong>
      </header>
      <PermissionCards sessionKey={sessionKey} />
      <TranscriptView key={sessionKey} sessionKey={sessionKey} working={working} />
      <footer className="session-footer composer-footer">
        {drive ? (
          <Composer session={session} drive={drive} working={working} keys />
        ) : (
          <p>{t('convReadOnly')}</p>
        )}
      </footer>
    </div>
  );
}
