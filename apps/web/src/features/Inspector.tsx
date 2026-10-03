import { ArrowUpRight, X, Focus, Cpu, Clock, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Agent, Snapshot } from '@aether/contracts';
import { AvatarIcon, Badge, useT } from '../ui.js';
import type { LocalSession } from '../localSessions.js';
export function Inspector({
  agent,
  snapshot,
  onClose,
  onFocus,
  session,
}: {
  agent: Agent | null;
  snapshot: Snapshot;
  onClose: () => void;
  onFocus: () => void;
  session?: LocalSession | null;
}) {
  const t = useT();
  const work = snapshot.work.find(
    (w) => w.assignee === agent?.id && !['cancelled', 'completed'].includes(w.state),
  );
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span>{t('details')}</span>
        <button className="icon-button" aria-label={t('close')} onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {agent ? (
        <>
          <div className="inspector-person">
            <AvatarIcon species={agent.species} color={agent.color} name={agent.name} size={78} />
            <h2>{agent.name}</h2>
            <p>{agent.role}</p>
            <Badge state={agent.activity} />
          </div>
          <div className="inspector-actions">
            <button className="secondary" onClick={onFocus}>
              <Focus size={15} />
              {t('focus')}
            </button>
            {!session && (
              <Link className="secondary" to={`/messages?project=${snapshot.project.id}`}>
                <MessageSquare size={15} />
                {t('messages')}
              </Link>
            )}
          </div>
          <div className="inspector-section">
            <h3>{t('profile')}</h3>
            <dl>
              <div>
                <dt>{t('provider')}</dt>
                <dd>{agent.provider.toUpperCase()}</dd>
              </div>
              <div>
                <dt>{t('mode')}</dt>
                <dd>
                  <Badge state={agent.mode} />
                </dd>
              </div>
              <div>
                <dt>{t('lastSeen')}</dt>
                <dd>
                  {agent.lastSeen
                    ? new Date(agent.lastSeen).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : t('unavailable')}
                </dd>
              </div>
              <div>
                <dt>{t('cost')}</dt>
                <dd title={t('costNote')}>{t('unavailable')}</dd>
              </div>
            </dl>
          </div>
          {session && (
            <div className="inspector-section">
              <h3>OBSERVE · {session.provider}</h3>
              <dl>
                <div>
                  <dt>cwd</dt>
                  <dd title={session.cwd}>{session.cwd}</dd>
                </div>
                <div>
                  <dt>branch</dt>
                  <dd>{session.git?.branch ?? t('unavailable')}</dd>
                </div>
                <div>
                  <dt>upstream</dt>
                  <dd>
                    {session.git?.upstream
                      ? `${session.git.upstream} ↑${session.git.ahead} ↓${session.git.behind}`
                      : t('unavailable')}
                  </dd>
                </div>
                <div>
                  <dt>uncommitted</dt>
                  <dd>{session.git?.uncommitted ?? t('unavailable')}</dd>
                </div>
              </dl>
              <small>{t('lastSeen')} · heuristic (file mtime)</small>
            </div>
          )}
          <div className="inspector-section">
            <h3>{t('currentWork')}</h3>
            {work ? (
              <div className="inspector-work">
                <Badge state={work.state} />
                <h4>{work.title}</h4>
                <p>{work.acceptance}</p>
                <Link to={`/tasks?project=${snapshot.project.id}`} className="text-button">
                  {t('details')}
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            ) : (
              <p className="muted">{t('noWork')}</p>
            )}
          </div>
          <div className="inspector-footer">
            <span className="tiny-label">IDENTITY</span>
            <code>{agent.id.slice(0, 8)}</code>
            {agent.mode === 'demo' && <small>{t('demoNote')}</small>}
          </div>
        </>
      ) : (
        <div className="inspector-empty">
          <div className="empty-orbit">
            <span />
          </div>
          <h3>{t('selectAgent')}</h3>
          <p>{t('agentHint')}</p>
        </div>
      )}
    </aside>
  );
}
