import { lazy, Suspense, useState } from 'react';
import { Plus, ArrowRight, CheckCircle2, GitBranch } from 'lucide-react';
import type { Snapshot, Work } from '@aether/contracts';
import { TaskDiagnostics } from './TaskDiagnostics.js';
import { execute } from '../api.js';
import { Modal, Field, Empty, Badge, PageHeading, useT } from '../ui.js';
const TaskDag = lazy(() => import('./TaskDag.js').then((m) => ({ default: m.TaskDag })));
export function TaskForm({
  snapshot,
  onClose,
  onSaved,
}: {
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title={t('newWork')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            await execute(
              'work.create',
              {
                title: values.get('title'),
                description: values.get('description'),
                acceptance: values.get('acceptance'),
                dependencies: values.getAll('dependencies'),
                priority: Number(values.get('priority')),
              },
              snapshot.project.id,
            );
            onSaved();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('workTitle')}>
          <input autoFocus required name="title" maxLength={160} />
        </Field>
        <Field label={t('description')}>
          <textarea name="description" rows={3} maxLength={16000} />
        </Field>
        <Field label={t('acceptance')}>
          <textarea name="acceptance" required rows={3} maxLength={8000} />
        </Field>
        <div className="field-row">
          <Field label={t('priority')}>
            <select name="priority" defaultValue="1">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </Field>
          <Field label={t('dependencies')}>
            <select name="dependencies" multiple>
              {snapshot.work.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? t('loading') : t('create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Tasks({
  snapshot,
  onNew,
  onSaved,
  canWrite,
  canExtend,
}: {
  snapshot: Snapshot;
  onNew: () => void;
  onSaved: () => void;
  canWrite: boolean;
  canExtend: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<'list' | 'board' | 'dag'>('list');
  const [selected, setSelected] = useState<Work | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState(false);
  const current = snapshot.work.find((w) => w.id === selected?.id) ?? selected;
  const rows = (items: Work[]) =>
    items.map((work) => (
      <button className="task-row" key={work.id} onClick={() => setSelected(work)}>
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
  return (
    <>
      <PageHeading
        title={t('tasks')}
        subtitle={`${snapshot.work.length} ${t('tasks')}`}
        action={
          <button className="primary" onClick={onNew} disabled={!canWrite}>
            <Plus size={16} />
            {t('newWork')}
          </button>
        }
      />
      <div className="view-switch">
        <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>
          {t('list')}
        </button>
        <button className={mode === 'board' ? 'active' : ''} onClick={() => setMode('board')}>
          {t('board')}
        </button>
        <button className={mode === 'dag' ? 'active' : ''} onClick={() => setMode('dag')}>
          {t('dag')}
        </button>
      </div>
      {snapshot.work.length ? (
        mode === 'dag' ? (
          <Suspense fallback={<p>{t('loading')}</p>}>
            <TaskDag snapshot={snapshot} onSelect={setSelected} />
          </Suspense>
        ) : mode === 'list' ? (
          <div className="task-list">{rows(snapshot.work)}</div>
        ) : (
          <div className="kanban">
            {(['ready', 'assigned', 'running', 'reviewing', 'completed'] as const).map((state) => (
              <section key={state}>
                <h3>
                  {t(state)} <span>{snapshot.work.filter((w) => w.state === state).length}</span>
                </h3>
                {rows(snapshot.work.filter((w) => w.state === state))}
              </section>
            ))}
          </div>
        )
      ) : (
        <Empty title={t('noTasks')} hint={t('noTasksHint')} />
      )}
      {current && (
        <Modal
          title={current.title}
          onClose={() => {
            setSelected(null);
            setError('');
          }}
        >
          <Badge state={current.state} />
          {current.cancelCause && (
            <p>
              {t('dependencyCancellation')}:{' '}
              {snapshot.work.find((w) => w.id === current.cancelCause)?.title ??
                current.cancelCause}
            </p>
          )}
          <TaskDiagnostics
            projectId={snapshot.project.id}
            workId={current.id}
            version={current.version}
          />
          <p className="preserve-space">{current.description}</p>
          <h3>{t('acceptance')}</h3>
          <p className="preserve-space">{current.acceptance}</p>
          <p>
            {t('dependencies')}:{' '}
            {snapshot.dependencies
              .filter((d) => d.workId === current.id)
              .map((d) => {
                const prerequisite = snapshot.work.find((w) => w.id === d.dependsOn);
                return prerequisite
                  ? `${prerequisite.title} (${t(prerequisite.state)})`
                  : d.dependsOn;
              })
              .join('、') || '—'}
          </p>
          {current.result && (
            <>
              <h3>{t('result')}</h3>
              <p className="result-text">{current.result}</p>
            </>
          )}
          <small>
            {t('version')} {current.version} · {current.id.slice(0, 8)}
          </small>
          {['ready', 'backlog'].includes(current.state) && current.attempt === 0 && (
            <form
              key={`dependencies-${current.id}-${current.version}`}
              onSubmit={async (e) => {
                e.preventDefault();
                const dependencies = new FormData(e.currentTarget).getAll('dependencies');
                setBusy(true);
                setError('');
                try {
                  await execute(
                    'work.dependencies',
                    { workId: current.id, dependencies },
                    snapshot.project.id,
                    current.version,
                  );
                  onSaved();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label={t('editDependencies')}>
                <select
                  name="dependencies"
                  multiple
                  defaultValue={snapshot.dependencies
                    .filter((d) => d.workId === current.id)
                    .map((d) => d.dependsOn)}
                >
                  {snapshot.work
                    .filter((w) => w.id !== current.id)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title}
                      </option>
                    ))}
                </select>
              </Field>
              <button className="secondary" disabled={!canWrite || busy}>
                {t('saveDependencies')}
              </button>
            </form>
          )}
          {current.state === 'ready' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await execute(
                    'work.assign',
                    { workId: current.id, agentId: new FormData(e.currentTarget).get('agentId') },
                    snapshot.project.id,
                    current.version,
                  );
                  onSaved();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label={t('chooseAgent')}>
                <select name="agentId" required>
                  {snapshot.agents
                    .filter((a) => a.mode !== 'observe')
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} · {agent.provider}
                      </option>
                    ))}
                </select>
              </Field>
              <button className="primary" disabled={!canWrite || busy || !snapshot.agents.length}>
                {t('assign')}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          {['failed', 'changes_requested'].includes(current.state) && (
            <>
              {snapshot.project.mode === 'live' && (
                <label>
                  <input
                    type="checkbox"
                    checked={resume}
                    onChange={(e) => setResume(e.target.checked)}
                  />
                  {t('resumeSession')}
                </label>
              )}
              <button
                className="primary"
                disabled={!canWrite || busy || current.attempt >= current.maxAttempts}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await execute(
                      'work.retry',
                      { workId: current.id, resume },
                      snapshot.project.id,
                      current.version,
                    );
                    onSaved();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('retry')} ({current.attempt}/{current.maxAttempts})
              </button>
            </>
          )}
          {['failed', 'changes_requested'].includes(current.state) &&
            current.attempt >= current.maxAttempts && (
              <>
                <p role="status">{t('attemptLimit')}</p>
                {canExtend && current.maxAttempts < 100 && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const reason = new FormData(e.currentTarget).get('reason');
                      setBusy(true);
                      setError('');
                      try {
                        await execute(
                          'work.extend',
                          { workId: current.id, reason },
                          snapshot.project.id,
                          current.version,
                        );
                        onSaved();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field label={t('extensionReason')}>
                      <textarea name="reason" required maxLength={2000} />
                    </Field>
                    <button className="secondary" disabled={busy}>
                      {t('extendAttempt')}
                    </button>
                  </form>
                )}
              </>
            )}
          {!['completed', 'cancelled'].includes(current.state) && (
            <>
              <p className="muted">{t('cancelDependencyNote')}</p>
              <button
                className="secondary danger"
                disabled={!canWrite || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await execute(
                      'work.cancel',
                      { workId: current.id },
                      snapshot.project.id,
                      current.version,
                    );
                    onSaved();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('cancel')}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
