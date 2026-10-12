import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Control } from '../../apps/control/src/control.js';
import {
  enroll,
  claim,
  report,
  sessionCredential,
  reconcileOffline,
} from '../../apps/control/src/services/runtime/runners.js';
import { command } from './fixture.js';
function setup() {
  let now = 1000;
  const control = new Control(':memory:', { mode: 'live', now: () => now });
  const owner = control.createIdentity(undefined, {
    name: 'Review fixture owner',
    role: 'owner',
    projectIds: ['*'],
  });
  const projectId = String(
    control.execute(owner.actor, command('project.create', { name: 'Review fixture' })).result[
      'id'
    ],
  );
  const register = (provider: string) =>
    String(
      control.execute(
        owner.actor,
        command(
          'agent.register',
          { name: provider, provider, role: 'Engineer', species: 'fox', color: '#abcdef' },
          projectId,
        ),
      ).result['id'],
    );
  const engineer = register('claude'),
    reviewer = register('codex');
  control.execute(
    owner.actor,
    command(
      'project.execution.configure',
      { liveEnabled: true, maxTurns: 2, timeoutMs: 30000 },
      projectId,
      0,
    ),
  );
  const workId = String(
    control.execute(
      owner.actor,
      command(
        'work.create',
        { title: 'Target', description: '', acceptance: 'Fixed review' },
        projectId,
      ),
    ).result['id'],
  );
  control.execute(owner.actor, command('work.assign', { workId, agentId: engineer }, projectId, 1));
  const machine = enroll(control.ctx, owner.actor, 'Review fixture machine', [projectId]);
  const implementation = claim(control.ctx, machine.actor, ['claude'])!;
  const base = { runId: implementation.runId, epoch: 1 };
  const workspace = {
    id: randomUUID(),
    projectId,
    workId,
    attempt: 1,
    repository: '/synthetic',
    path: '/synthetic/writer',
    branch: 'synthetic',
    baseSha: 'a'.repeat(40),
    createdAt: now,
  };
  report(control.ctx, machine.actor, {
    ...base,
    type: 'workspace',
    sourceEventId: randomUUID(),
    workspace,
  });
  report(control.ctx, machine.actor, {
    ...base,
    type: 'started',
    sourceEventId: randomUUID(),
    providerSessionId: 'implementation',
    processIdentity: 'synthetic',
  });
  report(control.ctx, machine.actor, {
    ...base,
    type: 'result',
    sourceEventId: randomUUID(),
    outcome: 'submitted',
    summary: 'Original engineer result',
    headSha: 'b'.repeat(40),
  });
  const work = () => control.snapshot(owner.actor, projectId).work.find((w) => w.id === workId)!;
  return {
    control,
    owner,
    projectId,
    engineer,
    reviewer,
    machine,
    workId,
    work,
    advance: () => {
      now += 50000;
    },
  };
}
it.each(['approve', 'changes_requested', 'stale', 'cancel', 'offline'] as const)(
  'binds reviewer identity/head/version and preserves implementation state (%s)',
  (mode) => {
    const f = setup();
    const { control, owner, projectId, engineer, reviewer, machine, workId, work } = f;
    try {
      expect(() =>
        control.execute(
          owner.actor,
          command('work.request_review', { workId, agentId: engineer }, projectId, work().version),
        ),
      ).toThrow('SELF_REVIEW_FORBIDDEN');
      const request = command(
        'work.request_review',
        { workId, agentId: reviewer },
        projectId,
        work().version,
      );
      const receipt = control.execute(owner.actor, request);
      expect(control.execute(owner.actor, request)).toEqual(receipt);
      const run = claim(control.ctx, machine.actor, ['codex'])!;
      expect(run).toMatchObject({
        purpose: 'review',
        reviewHead: 'b'.repeat(40),
        reviewBase: 'a'.repeat(40),
      });
      const token = sessionCredential(control.ctx, machine.actor, run.runId, 1).token;
      expect(() =>
        control.execute(
          control.authenticate(token),
          command(
            'work.create',
            { title: 'Unauthorized', description: '', acceptance: 'No writes' },
            projectId,
          ),
        ),
      ).toThrow('REVIEW_SESSION_READ_ONLY');
      const original = work();
      const base = { runId: run.runId, epoch: 1 };
      report(control.ctx, machine.actor, {
        ...base,
        type: 'workspace',
        sourceEventId: randomUUID(),
        workspace: {
          id: randomUUID(),
          projectId,
          workId,
          attempt: 1,
          repository: '/synthetic',
          path: '/synthetic/review',
          branch: 'review',
          baseSha: 'b'.repeat(40),
          createdAt: 1001,
        },
      });
      report(control.ctx, machine.actor, {
        ...base,
        type: 'started',
        sourceEventId: randomUUID(),
        providerSessionId: 'review',
        processIdentity: 'synthetic-review',
      });
      expect(work()).toEqual(original);
      if (mode === 'stale')
        control.execute(
          owner.actor,
          command(
            'work.review',
            { workId, decision: 'changes_requested', body: 'Human intervened' },
            projectId,
            work().version,
          ),
        );
      if (mode === 'cancel')
        control.execute(owner.actor, command('work.cancel', { workId }, projectId, work().version));
      if (mode === 'offline') {
        f.advance();
        reconcileOffline(control.ctx);
        expect(work()).toEqual(original);
      }
      const before = work();
      const decision = mode === 'changes_requested' ? 'changes_requested' : 'approve';
      const result = {
        ...base,
        type: 'result',
        sourceEventId: randomUUID(),
        outcome: 'submitted',
        summary: 'Reviewer summary',
        headSha: 'b'.repeat(40),
        review: { decision, body: 'Evidence at file.ts:1', headSha: 'b'.repeat(40) },
      };
      report(control.ctx, machine.actor, result);
      expect(report(control.ctx, machine.actor, result)).toEqual({ duplicate: true });
      if (mode === 'cancel')
        expect(work()).toMatchObject({
          state: 'indeterminate',
          result: before.result,
          headSha: before.headSha,
        });
      else if (['stale', 'offline'].includes(mode)) expect(work()).toEqual(before);
      else
        expect(work()).toMatchObject({
          state: decision === 'approve' ? 'reviewing' : 'changes_requested',
          reviewBy: decision === 'approve' ? reviewer : null,
          result: 'Original engineer result',
          submittedBy: engineer,
          headSha: 'b'.repeat(40),
          attempt: 1,
          verifiedSha: null,
        });
      expect(
        control.ctx.sqlite
          .prepare("SELECT purpose FROM workspaces WHERE path='/synthetic/review'")
          .get(),
      ).toEqual({ purpose: 'review' });
      if (mode === 'approve')
        expect(() =>
          control.execute(
            owner.actor,
            command('work.accept', { workId }, projectId, work().version),
          ),
        ).toThrow('INVALID_TRANSITION');
    } finally {
      control.close();
    }
  },
);

it('a workflow step fixes the reviewer provider: the wrong provider is refused and the right one is accepted', () => {
  const f = setup();
  const { control, owner, projectId, reviewer, workId, work } = f;
  try {
    const sql = control.ctx.sqlite;
    sql.pragma('foreign_keys = OFF');
    sql
      .prepare(
        "INSERT INTO workflows VALUES ('wf','" + projectId + "','claude_codex_review','t',?,1)",
      )
      .run(owner.actor.id);
    sql
      .prepare("INSERT INTO workflow_steps VALUES (?,'wf','engineer+reviewer',0,'claude','claude')")
      .run(workId);
    const request = () =>
      control.execute(
        owner.actor,
        command('work.request_review', { workId, agentId: reviewer }, projectId, work().version),
      );
    expect(request).toThrow('WORKFLOW_PROVIDER_MISMATCH');
    sql.prepare("UPDATE workflow_steps SET reviewerProvider='codex' WHERE workId=?").run(workId);
    expect(request().result).toMatchObject({ purpose: 'review', agentId: reviewer });
  } finally {
    control.close();
  }
});
