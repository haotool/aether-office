import { randomUUID } from 'node:crypto';
import type { Command, Workflow } from '@aether/contracts';
import { DomainError, TEMPLATES, type Actor } from '@aether/kernel';
import type { Context } from './context.js';
import { createWork } from './work.js';

type Start = Extract<Command, { type: 'workflow.start' }>;

export function startWorkflow(ctx: Context, actor: Actor, c: Start): Workflow {
  const plan = TEMPLATES[c.data.template];
  const workflowId = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO workflows(id,projectId,template,title,createdBy,createdAt) VALUES (?,?,?,?,?,?)',
    )
    .run(workflowId, c.projectId, c.data.template, c.data.title, actor.id, ctx.now());
  const ids: string[] = [];
  plan.forEach((step, position) => {
    const work = createWork(ctx, {
      schemaVersion: 1,
      type: 'work.create',
      projectId: c.projectId,
      idempotencyKey: `${c.idempotencyKey}:${position}`,
      correlationId: c.correlationId,
      data: {
        title: `${c.data.title}${step.titleSuffix}`.slice(0, 160),
        description: c.data.description,
        acceptance:
          `${c.data.acceptance}\n\nWorkflow step (${step.role}): ${step.acceptanceNote}`.slice(
            0,
            8000,
          ),
        dependencies: step.dependsOn.map((i) => ids[i]!),
        priority: c.data.priority,
      },
    } as Extract<Command, { type: 'work.create' }>);
    ids.push(work.id);
    ctx.sqlite
      .prepare(
        'INSERT INTO workflow_steps(workId,workflowId,role,position,engineerProvider,reviewerProvider) VALUES (?,?,?,?,?,?)',
      )
      .run(
        work.id,
        workflowId,
        step.role,
        position,
        step.engineerProvider ?? null,
        step.reviewerProvider ?? null,
      );
  });
  return readWorkflow(ctx, workflowId);
}

function readWorkflow(ctx: Context, workflowId: string): Workflow {
  const head = ctx.sqlite
    .prepare('SELECT id,template,title FROM workflows WHERE id=?')
    .get(workflowId) as { id: string; template: string; title: string } | undefined;
  if (!head) throw new DomainError('WORKFLOW_NOT_FOUND', 404);
  const steps = ctx.sqlite
    .prepare(
      'SELECT s.workId,s.role,s.position,s.engineerProvider,s.reviewerProvider,w.state FROM workflow_steps s JOIN work_items w ON w.id=s.workId WHERE s.workflowId=? ORDER BY s.position',
    )
    .all(workflowId) as Workflow['steps'];
  return { ...head, steps };
}

export function listWorkflows(ctx: Context, projectId: string): Workflow[] {
  return (
    ctx.sqlite
      .prepare('SELECT id FROM workflows WHERE projectId=? ORDER BY createdAt DESC,id')
      .all(projectId) as { id: string }[]
  ).map((w) => readWorkflow(ctx, w.id));
}
