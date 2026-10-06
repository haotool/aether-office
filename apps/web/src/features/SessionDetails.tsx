import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Agent, LocalSession, Snapshot } from '@aether/contracts';
import { ROLE_LABELS } from '@aether/kernel';
import { classificationOf } from '../localSessions.js';
import { roleWhy } from './role-why.js';
import { Badge, useT } from '../ui.js';

const Row = ({
  label,
  children,
  title,
}: {
  label: string;
  children: React.ReactNode;
  title?: string;
}) => (
  <div>
    <dt>{label}</dt>
    <dd title={title}>{children}</dd>
  </div>
);

function Observed({ session }: { session: LocalSession }) {
  const t = useT();
  const kind = classificationOf(session);
  const { git, resources, worktree, hook } = session;
  return (
    <dl>
      <Row label="cwd" title={session.cwd}>
        {session.cwd}
      </Row>
      <Row label="provider">{session.provider}</Row>
      <Row label="role" title={kind.evidence.join(' · ')}>
        {ROLE_LABELS[kind.role].en} · {roleWhy(kind, t)}
      </Row>
      <Row label="process">{session.process}</Row>
      {resources && (
        <Row label="cpu · mem">
          {resources.cpuPercent.toFixed(1)}% · {(resources.rssBytes / 1e6).toFixed(0)} MB
        </Row>
      )}
      {worktree && (
        <Row label="worktree" title={worktree.root}>
          {worktree.project} · {worktree.linked ? 'linked' : 'main'}
        </Row>
      )}
      {session.subagents.length > 0 && (
        <Row label="subagents">{session.subagents.map((c) => c.type).join(', ')}</Row>
      )}
      <Row label="branch">{git?.branch ?? t('unavailable')}</Row>
      <Row label="upstream">
        {git?.upstream ? `${git.upstream} ↑${git.ahead} ↓${git.behind}` : t('unavailable')}
      </Row>
      <Row label="uncommitted">{git?.uncommitted ?? t('unavailable')}</Row>
      <Row label={t('lastSeen')}>
        {hook
          ? `hook: ${hook.lastEvent}${hook.tool ? ` · ${hook.tool}` : ''}`
          : 'heuristic (file mtime)'}
      </Row>
    </dl>
  );
}

function Managed({ agent, snapshot }: { agent: Agent; snapshot: Snapshot }) {
  const t = useT();
  const work = snapshot.work.find(
    (w) => w.assignee === agent.id && !['cancelled', 'completed'].includes(w.state),
  );
  return (
    <>
      <dl>
        <Row label={t('provider')}>{agent.provider.toUpperCase()}</Row>
        <Row label={t('mode')}>
          <Badge state={agent.mode} />
        </Row>
        <Row label={t('lastSeen')}>
          {agent.lastSeen
            ? new Date(agent.lastSeen).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : t('unavailable')}
        </Row>
        <Row label="id">{agent.id.slice(0, 8)}</Row>
      </dl>
      <h4>{t('currentWork')}</h4>
      {work ? (
        <div className="details-work">
          <Badge state={work.state} />
          <strong>{work.title}</strong>
          <p>{work.acceptance}</p>
          <Link to={`/tasks?project=${snapshot.project.id}`} className="text-button">
            {t('details')}
            <ArrowUpRight size={14} />
          </Link>
        </div>
      ) : (
        <p className="muted">{t('noWork')}</p>
      )}
    </>
  );
}

/** Everything about the session that is not the conversation, in one fold that stays closed until asked for. */
export function SessionDetails({
  agent,
  session,
  snapshot,
}: {
  agent: Agent;
  session: LocalSession | null;
  snapshot: Snapshot;
}) {
  const t = useT();
  return (
    <details className="session-details" open={!session}>
      <summary>
        {session ? `${t('details')} · OBSERVE · ${session.provider}` : t('details')}
      </summary>
      {session ? <Observed session={session} /> : <Managed agent={agent} snapshot={snapshot} />}
    </details>
  );
}
