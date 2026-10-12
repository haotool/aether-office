import { createHash, randomUUID } from 'node:crypto';
import { AgentCard, Role, Task, TaskState, type Message, type Task as A2ATask } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  JsonRpcTransportHandler,
  ServerCallContext,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
  type TaskStore,
} from '@a2a-js/sdk/server';
import { APP_VERSION, type Command } from '@aether/contracts';
import { DomainError } from '@aether/kernel';
import type { Control } from '../../control.js';
import type { Context } from '../domain/context.js';
import { identityActor } from '../domain/identity.js';
import type { A2AClient } from './a2a-clients.js';
import { createWork } from '../work/work.js';

// A2A gateway: a remote agent can only submit a text request (an unassigned WorkItem in one project) and read or cancel
// its own tasks. It cannot start a process, read knowledge or reach another project, and nothing is fetched from URLs
// it supplies.

const A2A_METHODS = ['SendMessage', 'GetTask', 'CancelTask', 'ListTasks'] as const;
const MAX_TEXT = 16000;

type Client = A2AClient;
type WorkRow = { id: string; state: string; result: string | null; updatedAt: number };

const TERMINAL = ['completed', 'failed', 'cancelled'];

function taskStateOf(work: string): TaskState {
  switch (work) {
    case 'backlog':
    case 'ready':
    case 'assigned':
      return TaskState.TASK_STATE_SUBMITTED;
    case 'completed':
      return TaskState.TASK_STATE_COMPLETED;
    case 'failed':
      return TaskState.TASK_STATE_FAILED;
    case 'cancelled':
      return TaskState.TASK_STATE_CANCELED;
    case 'blocked':
    case 'indeterminate':
      return TaskState.TASK_STATE_INPUT_REQUIRED;
    default:
      return TaskState.TASK_STATE_WORKING;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

function buildTask(taskId: string, contextId: string, work: WorkRow): A2ATask {
  const state = taskStateOf(work.state);
  const result = state === TaskState.TASK_STATE_COMPLETED ? work.result : null;
  return Task.fromJSON({
    id: taskId,
    contextId,
    status: { state: TaskState[state], timestamp: iso(work.updatedAt) },
    artifacts: result
      ? [
          {
            artifactId: `${taskId}-result`,
            name: 'result',
            parts: [{ text: result.slice(0, MAX_TEXT) }],
          },
        ]
      : [],
    history: [],
  });
}

function textOf(message: Message): string {
  const parts = message.parts;
  if (!parts.length) throw new DomainError('A2A_EMPTY_MESSAGE', 400);
  // Only plain text is accepted: files, URLs and structured data are refused, never fetched.
  return parts
    .map((p) => {
      if (p.content?.$case !== 'text') throw new DomainError('A2A_PART_UNSUPPORTED', 400);
      return p.content.value;
    })
    .join('\n')
    .trim();
}

type Sql = Context['sqlite'];
type StoredTask = WorkRow & { taskId: string; contextId: string };

function activeClient(sql: Sql, request: RequestContext): Client {
  const client = sql
    .prepare(
      'SELECT id,projectId,maxOpen,createdBy FROM a2a_clients WHERE id=? AND revokedAt IS NULL',
    )
    .get(request.context.user?.userName ?? '') as Client | undefined;
  if (!client) throw new DomainError('AUTH_REQUIRED', 401);
  return client;
}

function openTaskCount(sql: Sql, clientId: string): number {
  return (
    sql
      .prepare(
        `SELECT COUNT(*) AS n FROM a2a_tasks t JOIN work_items w ON w.id=t.workId WHERE t.clientId=? AND w.state NOT IN (${TERMINAL.map(() => '?').join(',')})`,
      )
      .get(clientId, ...TERMINAL) as { n: number }
  ).n;
}

const rejectedTask = (request: RequestContext, now: number) =>
  Task.fromJSON({
    id: request.taskId,
    contextId: request.contextId,
    status: {
      state: 'TASK_STATE_REJECTED',
      timestamp: iso(now),
      message: {
        messageId: randomUUID(),
        role: 'ROLE_AGENT',
        parts: [{ text: 'Open task limit reached.' }],
      },
    },
    artifacts: [],
    history: [],
  });

function openWork(
  ctx: Context,
  client: Client,
  request: RequestContext,
  message: Message,
  text: string,
): WorkRow {
  const now = ctx.now();
  return ctx.sqlite.transaction(() => {
    const created = createWork(ctx, {
      schemaVersion: 1,
      type: 'work.create',
      projectId: client.projectId,
      idempotencyKey: `a2a:${client.id}:${message.messageId}`,
      correlationId: request.taskId,
      data: {
        title: (text.split('\n')[0] || 'A2A request').slice(0, 160),
        description:
          `${text}\n\nSource: A2A client "${client.id}". Untrusted remote request.`.slice(0, 16000),
        acceptance: 'A human must confirm the acceptance criteria before assignment.',
        dependencies: [],
        priority: 1,
      },
    } as Extract<Command, { type: 'work.create' }>);
    ctx.sqlite
      .prepare(
        'INSERT INTO a2a_tasks(taskId,clientId,workId,contextId,createdAt) VALUES (?,?,?,?,?)',
      )
      .run(request.taskId, client.id, created.id, request.contextId, now);
    ctx.sqlite
      .prepare('INSERT INTO a2a_messages(clientId,messageId,taskId) VALUES (?,?,?)')
      .run(client.id, message.messageId, request.taskId);
    return { id: created.id, state: created.state, result: null, updatedAt: now } satisfies WorkRow;
  })();
}

export class A2AGateway {
  readonly card: AgentCard;
  private readonly transport: JsonRpcTransportHandler;

  constructor(
    private readonly control: Control,
    publicUrl: string,
  ) {
    this.card = AgentCard.fromJSON({
      name: 'AETHER OFFICE',
      description:
        'Submit work to a local AETHER OFFICE project. Requests become unassigned work items that a human assigns and accepts.',
      version: APP_VERSION,
      supportedInterfaces: [
        { url: `${publicUrl}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
      ],
      capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
      securitySchemes: {
        bearer: {
          httpAuthSecurityScheme: {
            scheme: 'Bearer',
            bearerFormat: 'opaque',
            description: 'Per-client token issued by the project owner.',
          },
        },
      },
      securityRequirements: [{ schemes: { bearer: { list: [] } } }],
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      skills: [
        {
          id: 'work-intake',
          name: 'Submit a work request',
          description: 'Create a work item from a text description; query or cancel it later.',
          tags: ['work', 'intake'],
          examples: ['Review the checkout error handling'],
          inputModes: ['text/plain'],
          outputModes: ['text/plain'],
        },
      ],
    });
    const handler = new DefaultRequestHandler(this.card, this.taskStore(), this.executor());
    this.transport = new JsonRpcTransportHandler(handler);
  }

  async handle(client: Client, body: unknown): Promise<unknown> {
    const method = (body as { method?: unknown } | null)?.method;
    if (typeof method !== 'string' || !(A2A_METHODS as readonly string[]).includes(method))
      return {
        jsonrpc: '2.0',
        id: (body as { id?: unknown } | null)?.id ?? null,
        error: { code: -32601, message: 'Method not found' },
      };
    const context = new ServerCallContext({
      user: { isAuthenticated: true, userName: client.id },
      requestedVersion: '1.0',
    });
    const result = await this.transport.handle(body as Record<string, unknown>, context);
    if (Symbol.asyncIterator in (result as object))
      throw new DomainError('A2A_STREAMING_UNSUPPORTED', 400);
    return result;
  }

  private cancelWork(taskId: string): { contextId: string; after: WorkRow } {
    const sql = this.control.ctx.sqlite;
    const row = sql
      .prepare(
        'SELECT t.contextId,t.workId,w.version,w.projectId,c.createdBy FROM a2a_tasks t JOIN work_items w ON w.id=t.workId JOIN a2a_clients c ON c.id=t.clientId WHERE t.taskId=?',
      )
      .get(taskId) as
      | { contextId: string; workId: string; version: number; projectId: string; createdBy: string }
      | undefined;
    if (!row) throw new DomainError('TASK_NOT_FOUND', 404);
    this.control.execute(identityActor(this.control.ctx, row.createdBy), {
      schemaVersion: 1,
      type: 'work.cancel',
      projectId: row.projectId,
      idempotencyKey: createHash('sha256')
        .update(`a2a-cancel:${taskId}`)
        .digest('hex')
        .slice(0, 40),
      correlationId: taskId,
      expectedVersion: row.version,
      data: { workId: row.workId },
    });
    const after = sql
      .prepare('SELECT id,state,result,updatedAt FROM work_items WHERE id=?')
      .get(row.workId) as WorkRow;
    return { contextId: row.contextId, after };
  }

  private taskStore(): TaskStore {
    const sql = this.control.ctx.sqlite;
    const load = (taskId: string, clientId: string) => {
      const row = sql
        .prepare(
          'SELECT t.taskId,t.contextId,w.id,w.state,w.result,w.updatedAt FROM a2a_tasks t JOIN work_items w ON w.id=t.workId WHERE t.taskId=? AND t.clientId=?',
        )
        .get(taskId, clientId) as (WorkRow & { taskId: string; contextId: string }) | undefined;
      return row ? buildTask(row.taskId, row.contextId, row) : undefined;
    };
    return {
      // Scoped to the authenticated client: another client's task id behaves as if it does not exist.
      load: async (taskId, context) => load(taskId, context.user?.userName ?? ''),
      // State is derived from the work item, so nothing is cached. The one write the SDK performs
      save: async (task, context) => {
        if (task.status?.state !== TaskState.TASK_STATE_CANCELED) return;
        const owned = load(task.id, context.user?.userName ?? '');
        if (owned && owned.status?.state !== TaskState.TASK_STATE_CANCELED)
          this.cancelWork(task.id);
      },
      list: async (params, context) => {
        const rows = sql
          .prepare('SELECT taskId FROM a2a_tasks WHERE clientId=? ORDER BY createdAt DESC LIMIT ?')
          .all(context.user?.userName ?? '', Math.min(params.pageSize ?? 20, 50)) as {
          taskId: string;
        }[];
        const tasks = rows.flatMap((r) => load(r.taskId, context.user?.userName ?? '') ?? []);
        return { tasks, nextPageToken: '', pageSize: tasks.length, totalSize: tasks.length };
      },
    };
  }

  private executor(): AgentExecutor {
    const ctx = this.control.ctx;
    const sql = ctx.sqlite;
    return {
      execute: async (request: RequestContext, bus: ExecutionEventBus) => {
        const client = activeClient(sql, request);
        if (request.task) throw new DomainError('A2A_FOLLOW_UP_UNSUPPORTED', 400);
        const message = request.userMessage;
        const finish = (taskId: string, contextId: string, work: WorkRow) => {
          bus.publish({ kind: 'task', data: buildTask(taskId, contextId, work) });
          bus.finished();
        };
        const dedupe = sql
          .prepare('SELECT taskId FROM a2a_messages WHERE clientId=? AND messageId=?')
          .get(client.id, message.messageId) as { taskId: string } | undefined;
        if (dedupe) {
          const existing = sql
            .prepare(
              'SELECT t.taskId,t.contextId,w.id,w.state,w.result,w.updatedAt FROM a2a_tasks t JOIN work_items w ON w.id=t.workId WHERE t.taskId=?',
            )
            .get(dedupe.taskId) as StoredTask;
          return finish(existing.taskId, existing.contextId, existing);
        }
        const text = textOf(message).slice(0, MAX_TEXT);
        if (openTaskCount(sql, client.id) >= client.maxOpen) {
          bus.publish({ kind: 'task', data: rejectedTask(request, ctx.now()) });
          return bus.finished();
        }
        identityActor(ctx, client.createdBy);
        finish(request.taskId, request.contextId, openWork(ctx, client, request, message, text));
      },
      cancelTask: async (taskId: string, bus: ExecutionEventBus) => {
        const { contextId, after } = this.cancelWork(taskId);
        bus.publish({ kind: 'task', data: buildTask(taskId, contextId, after) });
        bus.finished();
      },
    };
  }
}

export { Role };
