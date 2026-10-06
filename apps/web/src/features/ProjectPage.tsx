import { lazy, Suspense } from 'react';
import type { LocalSessionsResponse, Snapshot } from '@aether/contracts';
import type { Session } from '../api.js';
import { usePreferences } from '../state.js';
import { useT, Empty } from '../ui.js';
import { Agents } from './Agents.js';
import { Approvals } from './Approvals.js';
import { CapabilityMatrix } from './CapabilityMatrix.js';
import { History } from './History.js';
import { Knowledge } from './Knowledge.js';
import { MachinesPage } from './MachinesPage.js';
import { Meetings } from './Meetings.js';
import { Messages } from './Messages.js';
import { Observations } from './Observations.js';
import { Reviews } from './Reviews.js';
import { Rooms } from './Rooms.js';
import { SettingsPage } from './settings/SettingsPage.js';
import { Sessions } from './Sessions.js';
import { Skills } from './Skills.js';
import { Tasks } from './Tasks.js';
import { Workspace } from './Workspace.js';

const Terminals = lazy(() => import('./Terminals.js').then((m) => ({ default: m.Terminals })));

/** Every page of a project except the office: picks one by its name. */
export function ProjectPage({
  page,
  data,
  session,
  projectId,
  sessions,
  canWrite,
  onSelect,
  onRefresh,
  onNewTask,
}: {
  page: string;
  data: Snapshot;
  session: Session;
  projectId: string;
  sessions: LocalSessionsResponse['sessions'];
  canWrite: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onNewTask: () => void;
}) {
  const t = useT();
  const prefs = usePreferences();
  const owner = session.actor.role === 'owner';
  return (
    <div className="page-padding">
      {page === 'agents' ? (
        <>
          <Agents snapshot={data} onSelect={onSelect} onSaved={onRefresh} canWrite={canWrite} />
          <CapabilityMatrix />
        </>
      ) : page === 'tasks' ? (
        <Tasks
          snapshot={data}
          onNew={onNewTask}
          onSaved={onRefresh}
          canWrite={canWrite}
          canExtend={owner}
        />
      ) : page === 'messages' ? (
        <>
          <Messages snapshot={data} onSaved={onRefresh} canWrite={canWrite} />
          <Rooms projectId={projectId} agents={data.agents} canManage={canWrite} />
          <Meetings projectId={projectId} agents={data.agents} canManage={canWrite} />
        </>
      ) : page === 'sessions' ? (
        <Sessions sessions={sessions} locale={prefs.locale} canStop={owner} />
      ) : page === 'observations' ? (
        <Observations key={projectId} projectId={projectId} />
      ) : page === 'terminals' ? (
        <Suspense fallback={<p>{t('loading')}</p>}>
          <Terminals
            key={projectId}
            projectId={projectId}
            userId={session.actor.id}
            canWrite={canWrite}
          />
        </Suspense>
      ) : page === 'workspace' ? (
        <Workspace snapshot={data} />
      ) : page === 'reviews' ? (
        <Reviews
          canRequestReview={canWrite}
          snapshot={data}
          onSaved={onRefresh}
          canReview={['owner', 'reviewer'].includes(session.actor.role)}
          canAccept={owner}
        />
      ) : page === 'approvals' ? (
        <Approvals projectId={projectId} />
      ) : page === 'knowledge' ? (
        <>
          <Knowledge
            projectId={projectId}
            canWrite={canWrite}
            canApprove={owner}
            workItems={data.work}
          />
          <Skills projectId={projectId} canManage={owner} />
        </>
      ) : page === 'history' ? (
        <History projectId={projectId} />
      ) : page === 'machines' ? (
        <MachinesPage data={data} projectId={projectId} canInvite={owner} />
      ) : page === 'settings' ? (
        <SettingsPage projectId={projectId} mode={session.mode} owner={owner} canWrite={canWrite} />
      ) : (
        <Empty title={t('empty')} />
      )}
    </div>
  );
}
