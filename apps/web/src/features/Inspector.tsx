import { ArrowUpRight, X, Focus, Cpu, Clock, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Agent, LocalSession, Snapshot } from '@aether/contracts';
import { ROLE_LABELS } from '@aether/kernel';
import { classificationOf } from '../localSessions.js';
import { AvatarIcon, Badge, useT } from '../ui.js';
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
  const kind = session ? classificationOf(session) : null;
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
          {session && kind && (
            <div className="inspector-section">
              <h3>OBSERVE · {session.provider}</h3>
              <dl>
                <div>
                  <dt>cwd</dt>
                  <dd title={session.cwd}>{session.cwd}</dd>
                </div>
                {session.title && (
                  <div>
                    <dt>title</dt>
                    <dd>{session.title}</dd>
                  </div>
                )}
                <div>
                  <dt>role</dt>
                  <dd
                    title={
                      kind.basis === 'default' ? 'no keyword matched' : `matched "${kind.matched}"`
                    }
                  >
                    {ROLE_LABELS[kind.role].en} · {kind.basis}
                  </dd>
                </div>
                {session.usage.model && (
                  <div>
                    <dt>model</dt>
                    <dd>{session.usage.model}</dd>
                  </div>
                )}
                {session.usage.contextTokens !== null && (
                  <div>
                    <dt>context</dt>
                    <dd>
                      {session.usage.contextTokens.toLocaleString()}
                      {session.usage.contextWindow
                        ? ` / ${session.usage.contextWindow.toLocaleString()} (${Math.round((session.usage.contextTokens / session.usage.contextWindow) * 100)}%)`
                        : ''}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>process</dt>
                  <dd>{session.process}</dd>
                </div>
                {session.worktree && (
                  <div>
                    <dt>worktree</dt>
                    <dd title={session.worktree.root}>
                      {session.worktree.project} · {session.worktree.linked ? 'linked' : 'main'}
                    </dd>
                  </div>
                )}
                {session.subagents.length > 0 && (
                  <div>
                    <dt>subagents</dt>
                    <dd>{session.subagents.map((c) => c.type).join(', ')}</dd>
                  </div>
                )}
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
              <small>
                {t('lastSeen')} ·{' '}
                {session.hook
                  ? `hook: ${session.hook.lastEvent}${session.hook.tool ? ` · ${session.hook.tool}` : ''}`
                  : 'heuristic (file mtime)'}
              </small>
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
