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
import type { Command } from '@aether/contracts';
import { DomainError } from '@aether/kernel';
import type { Control } from '../control.js';
import { identityActor } from './identity.js';
import type { A2AClient } from './a2a-clients.js';
import { createWork } from './work.js';

// A2A gateway. Remote agents get exactly one capability: submit a text request that becomes an
// ordinary, unassigned WorkItem in one project, then read or cancel their own tasks. The platform
// remains the authority: no remote caller can start a process, read knowledge, or reach another
// project, and nothing is fetched from URLs a remote agent supplies.

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
      return TaskState.TASK_STATE_INPUT_REQUIRED; // a human must look at it
    default:
      return TaskState.TASK_STATE_WORKING;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

function buildTask(taskId: string, contextId: string, work: WorkRow): A2ATask {
  const state = taskStateOf(work.state);
  const done = state === TaskState.TASK_STATE_COMPLETED && work.result;
  return Task.fromJSON({
    id: taskId,
    contextId,
    status: { state: TaskState[state], timestamp: iso(work.updatedAt) },
    artifacts: done
      ? [
          {
            artifactId: `${taskId}-result`,
            name: 'result',
            parts: [{ text: work.result!.slice(0, MAX_TEXT) }],
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
      version: '0.4.0-dev.0',
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

  // --- protocol ------------------------------------------------------------------------------
  /** Handles one JSON-RPC call. Only the declared methods are reachable; streaming is not offered. */
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

  // --- storage and execution: the work item is the source of truth ---------------------------
  /** Cancels the work item behind a task through the normal command path (human policy applies). */
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
      // for a cancel request arrives here as a CANCELED status: it is applied to the real work item.
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
    const sql = this.control.ctx.sqlite;
    return {
      execute: async (request: RequestContext, bus: ExecutionEventBus) => {
        const client = sql
          .prepare(
            'SELECT id,projectId,maxOpen,createdBy FROM a2a_clients WHERE id=? AND revokedAt IS NULL',
          )
          .get(request.context.user?.userName ?? '') as Client | undefined;
        if (!client) throw new DomainError('AUTH_REQUIRED', 401);
        if (request.task) throw new DomainError('A2A_FOLLOW_UP_UNSUPPORTED', 400); // one request, one work item
        const message = request.userMessage;
        const dedupe = sql
          .prepare('SELECT taskId FROM a2a_messages WHERE clientId=? AND messageId=?')
          .get(client.id, message.messageId) as { taskId: string } | undefined;
        const finish = (taskId: string, contextId: string, work: WorkRow) => {
          bus.publish({ kind: 'task', data: buildTask(taskId, contextId, work) });
          bus.finished();
        };
        if (dedupe) {
          const existing = sql
            .prepare(
              'SELECT t.taskId,t.contextId,w.id,w.state,w.result,w.updatedAt FROM a2a_tasks t JOIN work_items w ON w.id=t.workId WHERE t.taskId=?',
            )
            .get(dedupe.taskId) as WorkRow & { taskId: string; contextId: string };
          return finish(existing.taskId, existing.contextId, existing);
        }
        const text = textOf(message).slice(0, MAX_TEXT);
        const open = (
          sql
            .prepare(
              `SELECT COUNT(*) AS n FROM a2a_tasks t JOIN work_items w ON w.id=t.workId WHERE t.clientId=? AND w.state NOT IN (${TERMINAL.map(() => '?').join(',')})`,
            )
            .get(client.id, ...TERMINAL) as { n: number }
        ).n;
        if (open >= client.maxOpen) {
          // Over quota: refuse without creating anything.
          bus.publish({
            kind: 'task',
            data: Task.fromJSON({
              id: request.taskId,
              contextId: request.contextId,
              status: {
                state: 'TASK_STATE_REJECTED',
                timestamp: iso(this.control.ctx.now()),
                message: {
                  messageId: randomUUID(),
                  role: 'ROLE_AGENT',
                  parts: [{ text: 'Open task limit reached.' }],
                },
              },
              artifacts: [],
              history: [],
            }),
          });
          return bus.finished();
        }
        const actor = identityActor(this.control.ctx, client.createdBy);
        const now = this.control.ctx.now();
        const work = this.control.ctx.sqlite.transaction(() => {
          const created = createWork(this.control.ctx, actor, {
            schemaVersion: 1,
            type: 'work.create',
            projectId: client.projectId,
            idempotencyKey: `a2a:${client.id}:${message.messageId}`,
            correlationId: request.taskId,
            data: {
              title: (text.split('\n')[0] || 'A2A request').slice(0, 160),
              description:
                `${text}\n\nSource: A2A client "${client.id}". Untrusted remote request.`.slice(
                  0,
                  16000,
                ),
              acceptance: 'A human must confirm the acceptance criteria before assignment.',
              dependencies: [],
              priority: 1,
            },
          } as Extract<Command, { type: 'work.create' }>);
          sql
            .prepare(
              'INSERT INTO a2a_tasks(taskId,clientId,workId,contextId,createdAt) VALUES (?,?,?,?,?)',
            )
            .run(request.taskId, client.id, created.id, request.contextId, now);
          sql
            .prepare('INSERT INTO a2a_messages(clientId,messageId,taskId) VALUES (?,?,?)')
            .run(client.id, message.messageId, request.taskId);
          return {
            id: created.id,
            state: created.state,
            result: null,
            updatedAt: now,
          } satisfies WorkRow;
        })();
        finish(request.taskId, request.contextId, work);
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
