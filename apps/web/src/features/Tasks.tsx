import { lazy, Suspense, useState } from 'react';
import { Plus, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Snapshot, Work } from '@aether/contracts';
import { WorkflowStart } from './WorkflowStart.js';
import { BOARD } from './board.js';
import { Empty } from '../ui/Empty.js';
import { Badge } from '../ui/Badge.js';
import { PageHeading } from '../ui/PageHeading.js';
import { useT, useWhy } from '../ui/useT.js';
import { TaskDetail } from './TaskDetail.js';
const TaskDag = lazy(() => import('./TaskDag.js').then((m) => ({ default: m.TaskDag })));

type ViewMode = 'list' | 'board' | 'dag';

function TaskRows({ items, onSelect }: { items: Work[]; onSelect: (work: Work) => void }) {
  return items.map((work) => (
    <button className="task-row" key={work.id} onClick={() => onSelect(work)}>
      <span className="task-check">
        <CheckCircle2 size={17} />
      </span>
      <div>
        <strong>{work.title}</strong>
        <small>{work.description.slice(0, 110) || work.acceptance}</small>
      </div>
      <Badge state={work.state} />
      <span className="task-priority">P{work.priority}</span>
      <ArrowRight size={15} />
    </button>
  ));
}

function TaskBoard({ work, onSelect }: { work: Work[]; onSelect: (work: Work) => void }) {
  const t = useT();
  return (
    <div className="kanban">
      {BOARD.map(([column, states]) => {
        const items = work.filter((w) => (states as readonly string[]).includes(w.state));
        return (
          <section key={column}>
            <h3>
              {t(column)} <span>{items.length}</span>
            </h3>
            <TaskRows items={items} onSelect={onSelect} />
          </section>
        );
      })}
    </div>
  );
}

function ViewSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const t = useT();
  return (
    <div className="view-switch">
      {(['list', 'board', 'dag'] as const).map((m) => (
        <button key={m} className={mode === m ? 'active' : ''} onClick={() => onChange(m)}>
          {t(m)}
        </button>
      ))}
    </div>
  );
}

function TaskView({
  mode,
  snapshot,
  onSelect,
}: {
  mode: ViewMode;
  snapshot: Snapshot;
  onSelect: (work: Work) => void;
}) {
  const t = useT();
  if (!snapshot.work.length) return <Empty title={t('noTasks')} hint={t('noTasksHint')} />;
  if (mode === 'dag')
    return (
      <Suspense fallback={<p>{t('loading')}</p>}>
        <TaskDag snapshot={snapshot} onSelect={onSelect} />
      </Suspense>
    );
  if (mode === 'list')
    return (
      <div className="task-list">
        <TaskRows items={snapshot.work} onSelect={onSelect} />
      </div>
    );
  return <TaskBoard work={snapshot.work} onSelect={onSelect} />;
}

type TasksProps = {
  snapshot: Snapshot;
  onNew: () => void;
  onSaved: () => void;
  canWrite: boolean;
  canExtend: boolean;
};

export function Tasks({ snapshot, onNew, onSaved, canWrite, canExtend }: TasksProps) {
  const t = useT();
  const whyNot = useWhy();
  const [mode, setMode] = useState<ViewMode>('list');
  const [selected, setSelected] = useState<Work | null>(null);
  const current = snapshot.work.find((w) => w.id === selected?.id) ?? selected;
  return (
    <>
      <PageHeading
        title={t('tasks')}
        subtitle={`${snapshot.work.length} ${t('tasks')}`}
        action={
          <>
            {canWrite && <WorkflowStart projectId={snapshot.project.id} onSaved={onSaved} />}
            <button
              className="primary"
              onClick={onNew}
              disabled={!canWrite}
              {...whyNot([canWrite, 'needOperator'])}
            >
              <Plus size={16} />
              {t('newWork')}
            </button>
          </>
        }
      />
      <ViewSwitch mode={mode} onChange={setMode} />
      <TaskView mode={mode} snapshot={snapshot} onSelect={setSelected} />
      {current && (
        <TaskDetail
          snapshot={snapshot}
          work={current}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
          canWrite={canWrite}
          canExtend={canExtend}
        />
      )}
    </>
  );
}
