import { expect, it } from 'vitest';
import { command, fixture, seedWork } from './fixture.js';

const start = (f: ReturnType<typeof fixture>, template: string, title = 'Add export') =>
  f.control.execute(
    f.owner.actor,
    command(
      'workflow.start',
      { template, title, description: 'details', acceptance: 'It works end to end.' },
      f.projectId,
    ),
  ).result as {
    id: string;
    steps: {
      workId: string;
      role: string;
      position: number;
      engineerProvider: string | null;
      reviewerProvider: string | null;
      state: string;
    }[];
  };
const deps = (f: ReturnType<typeof fixture>) =>
  f.control.ctx.sqlite.prepare('SELECT workId,dependsOn FROM task_dependencies').all() as {
    workId: string;
    dependsOn: string;
  }[];

it('frontend/backend runs in parallel and the integration step waits for both', () => {
  const f = fixture();
  try {
    const wf = start(f, 'frontend_backend');
    expect(wf.steps.map((s) => s.role)).toEqual(['frontend', 'backend', 'integration']);
    const [fe, be, integration] = wf.steps.map((s) => s.workId) as [string, string, string];
    expect(wf.steps.map((s) => s.state)).toEqual(['ready', 'ready', 'backlog']);
    expect(
      deps(f)
        .filter((d) => d.workId === integration)
        .map((d) => d.dependsOn)
        .sort(),
    ).toEqual([fe, be].sort());
    expect(deps(f).filter((d) => d.workId === fe || d.workId === be)).toEqual([]);

    seedWork(f.control, fe, "state='completed'");
    seedWork(f.control, be, "state='completed'");
    f.control.execute(
      f.owner.actor,
      command('work.dependencies', { workId: integration, dependencies: [fe, be] }, f.projectId, 1),
    );
    expect(
      (
        f.control.ctx.sqlite
          .prepare('SELECT state FROM work_items WHERE id=?')
          .get(integration) as { state: string }
      ).state,
    ).toBe('ready');
  } finally {
    f.control.close();
  }
});

it('research → design → implementation → verification is a strict chain that keeps sources in the acceptance', () => {
  const f = fixture();
  try {
    const wf = start(f, 'research_design_impl', 'Pick a queue');
    expect(wf.steps.map((s) => s.role)).toEqual([
      'research',
      'design',
      'implementation',
      'verification',
    ]);
    const ids = wf.steps.map((s) => s.workId);
    expect(
      deps(f)
        .map((d) => [ids.indexOf(d.workId), ids.indexOf(d.dependsOn)])
        .sort(),
    ).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ]);
    expect(wf.steps.map((s) => s.state)).toEqual(['ready', 'backlog', 'backlog', 'backlog']);
    const acceptance = (
      f.control.ctx.sqlite.prepare('SELECT acceptance FROM work_items WHERE id=?').get(ids[0]) as {
        acceptance: string;
      }
    ).acceptance;
    expect(acceptance).toContain('every source recorded');
  } finally {
    f.control.close();
  }
});

it.each([
  ['claude_codex_review', 'claude', 'codex'],
  ['codex_claude_review', 'codex', 'claude'],
] as const)('%s only accepts a %s engineer and a %s reviewer', (template, engineer, reviewer) => {
  const f = fixture();
  try {
    const { steps } = start(f, template);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ engineerProvider: engineer, reviewerProvider: reviewer });
    const workId = steps[0]!.workId;
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
      ),
    ).toThrow('WORKFLOW_PROVIDER_MISMATCH');
    expect(
      (
        f.control.ctx.sqlite.prepare('SELECT state FROM work_items WHERE id=?').get(workId) as {
          state: string;
        }
      ).state,
    ).toBe('ready');
  } finally {
    f.control.close();
  }
});

it('a plain work item has no provider constraint, and workflow.start is for humans with write access only', () => {
  const f = fixture();
  try {
    const plain = String(
      f.control.execute(
        f.owner.actor,
        command('work.create', { title: 'Plain', description: '', acceptance: 'x' }, f.projectId),
      ).result['id'],
    );
    f.control.execute(
      f.owner.actor,
      command('work.assign', { workId: plain, agentId: f.senderId }, f.projectId, 1),
    );
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command(
          'workflow.start',
          { template: 'research_design_impl', title: 'x', acceptance: 'y' },
          f.projectId,
        ),
      ),
    ).toThrow('FORBIDDEN');
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command(
          'workflow.start',
          { template: 'nonsense', title: 'x', acceptance: 'y' },
          f.projectId,
        ),
      ),
    ).toThrow();
  } finally {
    f.control.close();
  }
});
