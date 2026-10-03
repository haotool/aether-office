import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { Role, TaskState } from '@a2a-js/sdk';
import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { createServer } from '../../apps/control/src/server.js';
import { command, fixture, seedWork } from './fixture.js';

// A fresh port per test: a pooled keep-alive socket to a closed server would otherwise be reused.
let nextPort = 4497;

const text = (value: string) => ({
  content: { $case: 'text' as const, value },
  metadata: undefined,
  filename: '',
  mediaType: '',
});
const userMessage = (value: string, messageId: string = randomUUID(), extra: object = {}) => ({
  messageId,
  contextId: '',
  taskId: '',
  role: Role.ROLE_USER,
  parts: [text(value)],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
  ...extra,
});
const request = (message: ReturnType<typeof userMessage>) => ({
  tenant: '',
  message,
  configuration: undefined,
  metadata: undefined,
});

async function setup(options: { a2a: boolean } = { a2a: true }) {
  const PORT = nextPort++;
  const ORIGIN = `http://127.0.0.1:${PORT}`;
  const f = fixture();
  const app = createServer(f.control, { origin: ORIGIN, a2a: options.a2a });
  await app.listen({ host: '127.0.0.1', port: PORT });
  const issue = (name: string, maxOpen = 10) =>
    f.control.execute(f.owner.actor, command('a2a.client.create', { name, maxOpen }, f.projectId))
      .result as { id: string; token: string };
  const clientFor = async (token: string) => {
    const authed: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    };
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl: authed })],
      }),
    );
    return factory.createFromUrl(ORIGIN);
  };
  const works = () =>
    f.control.ctx.sqlite
      .prepare('SELECT id,title,state,projectId,assignee FROM work_items')
      .all() as {
      id: string;
      title: string;
      state: string;
      projectId: string;
      assignee: string | null;
    }[];
  return { f, app, issue, clientFor, works, ORIGIN };
}

it('is absent unless explicitly enabled', async () => {
  const t = await setup({ a2a: false });
  try {
    expect((await fetch(`${t.ORIGIN}/.well-known/agent-card.json`)).status).toBe(404);
    expect((await fetch(`${t.ORIGIN}/a2a`, { method: 'POST' })).status).toBe(404);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('publishes an honest Agent Card: only what is implemented is declared', async () => {
  const t = await setup();
  try {
    const card = (await (await fetch(`${t.ORIGIN}/.well-known/agent-card.json`)).json()) as Record<
      string,
      any
    >;
    expect(card['name']).toBe('AETHER OFFICE');
    expect(card['supportedInterfaces'][0]).toMatchObject({
      url: `${t.ORIGIN}/a2a`,
      protocolBinding: 'JSONRPC',
      protocolVersion: '1.0',
    });
    expect(card['capabilities']).toMatchObject({ streaming: false, pushNotifications: false });
    expect(JSON.stringify(card['securitySchemes'])).toContain('Bearer');
    expect(card['skills'].map((s: { id: string }) => s.id)).toEqual(['work-intake']);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('turns a remote request into an unassigned work item, deduplicates retries, reports state and cancels', async () => {
  const t = await setup();
  try {
    const { token } = t.issue('Remote planner');
    const client = await t.clientFor(token);
    const message = userMessage('Review the checkout error handling\nPlease be thorough.', 'msg-1');
    const first = (await client.sendMessage(request(message))) as any;
    const task = first.task ?? first;
    expect(task.status.state).toBe(TaskState.TASK_STATE_SUBMITTED);
    expect(t.works()).toHaveLength(1);
    expect(t.works()[0]).toMatchObject({
      title: 'Review the checkout error handling',
      state: 'ready',
      assignee: null,
      projectId: t.f.projectId,
    });

    const retry = (await client.sendMessage(request(message))) as any;
    expect((retry.task ?? retry).id).toBe(task.id); // same messageId: same task, no second work item
    expect(t.works()).toHaveLength(1);

    const workId = t.works()[0]!.id;
    seedWork(t.f.control, workId, "state='running'");
    expect(
      (await client.getTask({ tenant: '', id: task.id, historyLength: undefined })).status?.state,
    ).toBe(TaskState.TASK_STATE_WORKING);
    seedWork(t.f.control, workId, "state='completed',result='Done: see commit abc'");
    const done = await client.getTask({ tenant: '', id: task.id, historyLength: undefined });
    expect(done.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(JSON.stringify(done.artifacts)).toContain('Done: see commit abc');

    const second = (await client.sendMessage(
      request(userMessage('Another request', 'msg-2')),
    )) as any;
    const secondTask = second.task ?? second;
    const cancelled = await client.cancelTask({
      tenant: '',
      id: secondTask.id,
      metadata: undefined,
    });
    expect(cancelled.status?.state).toBe(TaskState.TASK_STATE_CANCELED);
    expect(t.works().find((w) => w.title === 'Another request')!.state).toBe('cancelled');
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('authenticates every call, isolates clients, and refuses what it does not support', async () => {
  const t = await setup();
  try {
    const a = t.issue('A');
    const b = t.issue('B');
    const clientA = await t.clientFor(a.token);
    const clientB = await t.clientFor(b.token);
    const sent = (await clientA.sendMessage(request(userMessage('A private request')))) as any;
    const task = (sent.task ?? sent) as { id: string };

    await expect(
      clientB.getTask({ tenant: '', id: task.id, historyLength: undefined }),
    ).rejects.toThrow(); // not found for B
    await expect(
      clientB.cancelTask({ tenant: '', id: task.id, metadata: undefined }),
    ).rejects.toThrow();
    expect(t.works().find((w) => w.title === 'A private request')!.state).toBe('ready'); // B could not cancel it

    const call = (token: string | null, body: object) =>
      fetch(`${t.ORIGIN}/a2a`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    expect(
      (await call(null, { jsonrpc: '2.0', id: 1, method: 'GetTask', params: { id: 'x' } })).status,
    ).toBe(401);
    expect(
      (await call('a2a_bogus', { jsonrpc: '2.0', id: 1, method: 'GetTask', params: { id: 'x' } }))
        .status,
    ).toBe(401);
    const streaming = (await (
      await call(a.token, { jsonrpc: '2.0', id: 2, method: 'SendStreamingMessage', params: {} })
    ).json()) as { error: { code: number } };
    expect(streaming.error.code).toBe(-32601); // not offered, so not routed
    const resubscribe = (await (
      await call(a.token, {
        jsonrpc: '2.0',
        id: 3,
        method: 'SubscribeToTask',
        params: { id: task.id },
      })
    ).json()) as { error: { code: number } };
    expect(resubscribe.error.code).toBe(-32601);

    const before = t.works().length;
    const urlPart = {
      content: { $case: 'url' as const, value: 'http://169.254.169.254/latest' } as never,
      metadata: undefined,
      filename: '',
      mediaType: '',
    };
    // A refused request with no task yet is a protocol error; a refused follow-up is a FAILED task.
    await expect(
      clientA.sendMessage(request({ ...userMessage('x'), parts: [urlPart] })),
    ).rejects.toThrow();
    const followUp = (await clientA.sendMessage(
      request(userMessage('follow up', undefined, { taskId: task.id })),
    )) as any;
    expect((followUp.task ?? followUp).status.state).toBe(TaskState.TASK_STATE_FAILED);
    expect(t.works()).toHaveLength(before); // nothing was created, and no URL was ever fetched

    t.f.control.execute(
      t.f.owner.actor,
      command('a2a.client.revoke', { clientId: b.id }, t.f.projectId),
    );
    expect(
      (await call(b.token, { jsonrpc: '2.0', id: 4, method: 'ListTasks', params: {} })).status,
    ).toBe(401);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('enforces a per-client open-task quota with a REJECTED task and no work item', async () => {
  const t = await setup();
  try {
    const { token } = t.issue('Limited', 1);
    const client = await t.clientFor(token);
    await client.sendMessage(request(userMessage('first')));
    const over = (await client.sendMessage(request(userMessage('second')))) as any;
    expect((over.task ?? over).status.state).toBe(TaskState.TASK_STATE_REJECTED);
    expect(t.works().map((w) => w.title)).toEqual(['first']);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('keeps token audiences apart: an A2A token reaches nothing else, and an owner token is not an A2A credential', async () => {
  const t = await setup();
  try {
    const { token } = t.issue('Audience check');
    const asA2A = (path: string) =>
      fetch(`${t.ORIGIN}${path}`, { headers: { authorization: `Bearer ${token}` } });
    expect((await asA2A('/api/projects')).status).toBe(401);
    expect((await asA2A(`/api/projects/${t.f.projectId}/snapshot`)).status).toBe(401);
    const asOwner = await fetch(`${t.ORIGIN}/a2a`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t.f.owner.token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ListTasks', params: {} }),
    });
    expect(asOwner.status).toBe(401);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});
