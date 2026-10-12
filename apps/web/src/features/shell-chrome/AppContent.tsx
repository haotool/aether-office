import { lazy, Suspense, useState, type ComponentProps } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Orbit } from 'lucide-react';
import type { AttributedSession, Layout, Project, Snapshot } from '@aether/contracts';
import { ApiError } from '../../lib/api/api-error.js';
import { type Session } from '../../lib/api/api-session.js';
import type { Key } from '../../lib/i18n/i18n.js';
import { pageLink } from '../../lib/navigation/nav.js';
import { useT } from '../../ui/useT.js';
import { Empty } from '../../ui/Empty.js';
import type { OfficeModel } from '../office/office-model.js';
import { NotFound } from './NotFound.js';
import { OfficePage } from '../office/OfficePage.js';
import { PhoneOffice } from '../office/PhoneOffice.js';

const FirstRun = lazy(() => import('./FirstRun.js').then((m) => ({ default: m.FirstRun })));
const TaskForm = lazy(() =>
  import('../tasks-git/TaskForm.js').then((m) => ({ default: m.TaskForm })),
);
const ProjectPage = lazy(() =>
  import('../integrations/ProjectPage.js').then((m) => ({ default: m.ProjectPage })),
);
const LayoutEditor = lazy(() =>
  import('../office/LayoutEditor.js').then((m) => ({ default: m.LayoutEditor })),
);

type OfficeProps = ComponentProps<typeof OfficePage>;

type Props = {
  session: Session;
  page: Key;
  unknownPage: boolean;
  projects: UseQueryResult<Project[]>;
  snapshot: UseQueryResult<Snapshot>;
  projectId: string | undefined;
  sessions: AttributedSession[];
  quiet: boolean;
  compact: boolean;
  covered: boolean;
  model: OfficeModel;
  selectedId: string | null;
  focus: string;
  tour: OfficeProps['tour'];
  preview: Layout | null;
  unread: OfficeProps['unread'];
  canWrite: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onFeed: (id: string) => void;
  onFocus: (focus: string) => void;
  onTour: OfficeProps['onTour'];
  onTogglePanel: () => void;
  onPreview: (layout: Layout | null) => void;
  onNewProject: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
};

function PageLoading() {
  const t = useT();
  return (
    <div className="boot-screen">
      <Orbit size={30} />
      {t('loading')}
    </div>
  );
}

export function AppContent(props: Props) {
  const { projects, snapshot, projectId, session } = props;
  const data = snapshot.data;
  if (projects.isPending || (!data && snapshot.isPending && projectId)) return <PageLoading />;
  if (projects.error || snapshot.error)
    return <LoadFailure projects={projects} snapshot={snapshot} onRefresh={props.onRefresh} />;
  if (props.unknownPage) return <NotFound home={pageLink('office', projectId)} />;
  if (!projectId || (props.quiet && data))
    return (
      <div className="page-padding">
        <Suspense fallback={<PageLoading />}>
          <FirstRun
            onNewProject={session.actor.role === 'owner' ? props.onNewProject : undefined}
          />
        </Suspense>
      </div>
    );
  return data ? <ProjectBody {...props} data={data} projectId={projectId} /> : null;
}

function LoadFailure({
  projects,
  snapshot,
  onRefresh,
}: Pick<Props, 'projects' | 'snapshot' | 'onRefresh'>) {
  const t = useT();
  const navigate = useNavigate();
  const failure = projects.error ?? snapshot.error;
  // Asking again cannot bring back what is gone: a missing project (404) only has the way home.
  const gone = failure instanceof ApiError && failure.status === 404;
  return (
    <Empty
      title={t('error')}
      hint={failure?.message}
      action={
        gone ? (
          <button className="secondary" onClick={() => navigate(pageLink('office', undefined))}>
            {t('goHome')}
          </button>
        ) : (
          <button
            className="secondary"
            onClick={() => {
              void projects.refetch();
              onRefresh();
            }}
          >
            {t('retry')}
          </button>
        )
      }
    />
  );
}

type BodyProps = Props & {
  data: Snapshot;
  projectId: string;
  onNewTask: () => void;
  onEditLayout: () => void;
};

function PhoneBody(props: BodyProps) {
  const { data, session, model } = props;
  return (
    <PhoneOffice
      data={data}
      model={model}
      selectedId={props.selectedId}
      focus={props.focus}
      preview={props.preview}
      unread={props.unread}
      canWrite={props.canWrite}
      sessions={props.sessions}
      owner={session.actor.role === 'owner'}
      covered={props.covered}
      onSelect={props.onSelect}
      onOpen={props.onOpen}
      onFeed={props.onFeed}
      onFocus={props.onFocus}
      onTour={props.onTour}
      onNewTask={props.onNewTask}
      onNotice={props.onNotice}
      onRefresh={props.onRefresh}
    />
  );
}

function DesktopBody(props: BodyProps) {
  const { data, session, model } = props;
  return (
    <OfficePage
      data={data}
      session={session}
      model={model}
      projectId={props.projectId}
      selectedId={props.selectedId}
      focus={props.focus}
      tour={props.tour}
      preview={props.preview}
      unread={props.unread}
      canWrite={props.canWrite}
      onSelect={props.onSelect}
      onOpen={props.onOpen}
      onFeed={props.onFeed}
      onFocus={props.onFocus}
      onTour={props.onTour}
      onTogglePanel={props.onTogglePanel}
      onNewTask={props.onNewTask}
      onEditLayout={props.onEditLayout}
      onNotice={props.onNotice}
      onRefresh={props.onRefresh}
    />
  );
}

function OfficeBody(props: BodyProps) {
  return props.compact ? <PhoneBody {...props} /> : <DesktopBody {...props} />;
}

function ProjectBody(props: Props & { data: Snapshot; projectId: string }) {
  const { data, page, session, model, onRefresh } = props;
  const [newTask, setNewTask] = useState(false);
  const [editor, setEditor] = useState(false);
  const openTaskForm = () => setNewTask(true);
  return (
    <>
      {page === 'office' ? (
        <OfficeBody {...props} onNewTask={openTaskForm} onEditLayout={() => setEditor(true)} />
      ) : (
        <Suspense fallback={<PageLoading />}>
          <ProjectPage
            page={page}
            data={data}
            session={session}
            projectId={props.projectId}
            sessions={props.sessions}
            canWrite={props.canWrite}
            onSelect={props.onSelect}
            onRefresh={onRefresh}
            onNewTask={openTaskForm}
          />
        </Suspense>
      )}
      {newTask && (
        <Suspense fallback={null}>
          <TaskForm snapshot={data} onClose={() => setNewTask(false)} onSaved={onRefresh} />
        </Suspense>
      )}
      {editor && (
        <Suspense fallback={null}>
          <LayoutEditor
            snapshot={data}
            onClose={() => setEditor(false)}
            onSaved={onRefresh}
            onPreview={props.onPreview}
            liveSquads={model.liveSquads}
          />
        </Suspense>
      )}
    </>
  );
}
