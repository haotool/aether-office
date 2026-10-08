import { lazy, Suspense, type ReactNode } from 'react';
import type { LocalSessionsResponse, Snapshot } from '@aether/contracts';
import type { Session } from '../../lib/api/api-session.js';
import { pageLink } from '../../lib/navigation/nav.js';
import { useT, useLocale } from '../../ui/useT.js';
import { NotFound } from '../shell-chrome/NotFound.js';
import { Agents } from './Agents.js';
import { Approvals } from '../operations/Approvals.js';
import { CapabilityMatrix } from './CapabilityMatrix.js';
import { History } from '../conversation/History.js';
import { Knowledge } from '../operations/Knowledge.js';
import { MachinesPage } from './MachinesPage.js';
import { Meetings } from '../operations/Meetings.js';
import { Messages } from '../conversation/Messages.js';
import { Observations } from '../operations/Observations.js';
import { Reviews } from '../tasks-git/Reviews.js';
import { Rooms } from '../operations/Rooms.js';
import { SettingsPage } from '../settings/SettingsPage.js';
import { Sessions } from '../sessions/Sessions.js';
import { Skills } from '../operations/Skills.js';
import { Tasks } from '../tasks-git/Tasks.js';
import { Workspace } from './Workspace.js';

const Terminals = lazy(() =>
  import('../terminal/Terminals.js').then((m) => ({ default: m.Terminals })),
);

type PageProps = {
  data: Snapshot;
  session: Session;
  projectId: string;
  sessions: LocalSessionsResponse['sessions'];
  canWrite: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onNewTask: () => void;
};

function SessionsPage({ sessions, owner }: { sessions: PageProps['sessions']; owner: boolean }) {
  const locale = useLocale();
  return <Sessions sessions={sessions} locale={locale} canStop={owner} />;
}

function TerminalsPage({ projectId, session, canWrite }: PageProps) {
  const t = useT();
  return (
    <Suspense fallback={<p>{t('loading')}</p>}>
      <Terminals
        key={projectId}
        projectId={projectId}
        userId={session.actor.id}
        canWrite={canWrite}
      />
    </Suspense>
  );
}

const isOwner = (session: Session) => session.actor.role === 'owner';

/** The body of each page, by the name in the address. */
const PAGES: Record<string, (p: PageProps) => ReactNode> = {
  agents: (p) => (
    <>
      <Agents snapshot={p.data} onSelect={p.onSelect} onSaved={p.onRefresh} canWrite={p.canWrite} />
      <CapabilityMatrix />
    </>
  ),
  tasks: (p) => (
    <Tasks
      snapshot={p.data}
      onNew={p.onNewTask}
      onSaved={p.onRefresh}
      canWrite={p.canWrite}
      canExtend={isOwner(p.session)}
    />
  ),
  messages: (p) => (
    <>
      <Messages snapshot={p.data} onSaved={p.onRefresh} canWrite={p.canWrite} />
      <Rooms projectId={p.projectId} agents={p.data.agents} canManage={p.canWrite} />
      <Meetings projectId={p.projectId} agents={p.data.agents} canManage={p.canWrite} />
    </>
  ),
  sessions: (p) => <SessionsPage sessions={p.sessions} owner={isOwner(p.session)} />,
  observations: (p) => <Observations key={p.projectId} projectId={p.projectId} />,
  terminals: (p) => <TerminalsPage {...p} />,
  workspace: (p) => <Workspace snapshot={p.data} />,
  reviews: (p) => (
    <Reviews
      canRequestReview={p.canWrite}
      snapshot={p.data}
      onSaved={p.onRefresh}
      canReview={['owner', 'reviewer'].includes(p.session.actor.role)}
      canAccept={isOwner(p.session)}
    />
  ),
  approvals: (p) => <Approvals projectId={p.projectId} live={p.session.mode === 'live'} />,
  knowledge: (p) => (
    <>
      <Knowledge
        projectId={p.projectId}
        canWrite={p.canWrite}
        canApprove={isOwner(p.session)}
        workItems={p.data.work}
      />
      <Skills projectId={p.projectId} canManage={isOwner(p.session)} />
    </>
  ),
  history: (p) => <History projectId={p.projectId} />,
  machines: (p) => (
    <MachinesPage data={p.data} projectId={p.projectId} canInvite={isOwner(p.session)} />
  ),
  settings: (p) => (
    <SettingsPage
      projectId={p.projectId}
      mode={p.session.mode}
      owner={isOwner(p.session)}
      canWrite={p.canWrite}
    />
  ),
};

/** Every page of a project except the office: picks one by its name. */
export function ProjectPage({ page, ...props }: PageProps & { page: string }) {
  const render = Object.hasOwn(PAGES, page) ? PAGES[page] : undefined;
  return (
    <div className="page-padding">
      {render ? render(props) : <NotFound home={pageLink('office', props.projectId)} />}
    </div>
  );
}
