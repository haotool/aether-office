import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { command, fixture, seedWork } from './fixture.js';

type Issue = {
  id: number;
  number: number;
  title: string;
  body: string;
  updated_at: string;
  pull_request?: object;
};
const state = {
  issues: [] as Issue[],
  mode: 'ok' as 'ok' | 'unauthorized' | 'ratelimit',
  requests: [] as { url: string; auth: string | undefined }[],
  comments: [] as { url: string; body: string }[],
  linear: [] as {
    id: string;
    identifier: string;
    title: string;
    description: string;
    url: string;
    updatedAt: string;
  }[],
  linearRateLimited: false,
  resetAt: 0, // epoch seconds the fake provider reports for its rate-limit reset
};
let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const auth = req.headers['authorization'] as string | undefined;
      state.requests.push({ url: req.url ?? '', auth });
      if (req.url?.startsWith('/graphql')) {
        res.setHeader('content-type', 'application/json');
        if (state.linearRateLimited)
          return void res.end(
            JSON.stringify({ errors: [{ extensions: { code: 'RATELIMITED' } }] }),
          );
        if (body.includes('commentCreate'))
          return void res.end(JSON.stringify({ data: { commentCreate: { success: true } } }));
        return void res.end(JSON.stringify({ data: { issues: { nodes: state.linear } } }));
      }
      if (state.mode === 'unauthorized') return void res.writeHead(401).end('{}');
      if (state.mode === 'ratelimit')
        return void res
          .writeHead(403, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(state.resetAt),
          })
          .end('{}');
      if (req.method === 'POST') {
        state.comments.push({ url: req.url ?? '', body: JSON.parse(body).body });
        return void res.writeHead(201).end('{}');
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify(
          state.issues.map((i) => ({
            ...i,
            html_url: `https://github.com/acme/app/issues/${i.number}`,
          })),
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  Object.assign(state, {
    mode: 'ok',
    requests: [],
    comments: [],
    linearRateLimited: false,
    linear: [],
  });
  state.issues = [
    {
      id: 101,
      number: 1,
      title: 'Fix login',
      body: 'It breaks',
      updated_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 102,
      number: 2,
      title: 'Add export',
      body: 'CSV please',
      updated_at: '2026-10-02T00:00:00Z',
    },
    {
      id: 103,
      number: 3,
      title: 'A pull request',
      body: '',
      updated_at: '2026-10-02T00:00:00Z',
      pull_request: {},
    },
  ];
});

const SECRET = 'ghp_super_secret_token_value';
function setup() {
  let now = Date.parse('2026-10-03T00:00:00Z');
  const f = fixture(':memory:', () => now);
  const connectors = {
    policy: { ports: [port], isAllowed: (ip: string) => ip === '127.0.0.1' },
    env: { GH_TOKEN: SECRET, GH_HOOK: 'hook-secret', LIN_TOKEN: 'lin_key' },
  };
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4493', connectors });
  const headers = { authorization: `Bearer ${f.owner.token}`, host: '127.0.0.1:4493' };
  const connect = (data: Record<string, unknown>) =>
    f.control.execute(f.owner.actor, command('integration.connect', data, f.projectId)).result as {
      id: string;
      version: number;
    };
  const github = () =>
    connect({
      provider: 'github',
      owner: 'acme',
      repo: 'app',
      tokenEnv: 'GH_TOKEN',
      webhookSecretEnv: 'GH_HOOK',
      baseUrl: `http://127.0.0.1:${port}`,
    });
  const sync = (id: string) =>
    app.inject({
      method: 'POST',
      url: `/api/projects/${f.projectId}/integrations/${id}/sync`,
      headers,
    });
  const works = () =>
    f.control.ctx.sqlite
      .prepare('SELECT id,title,state,attempt FROM work_items ORDER BY title')
      .all() as { id: string; title: string; state: string; attempt: number }[];
  return {
    f,
    app,
    now: () => now,
    advance: (ms: number) => (now += ms),
    github,
    connect,
    sync,
    headers,
    works,
  };
}

it('imports issues once (skipping PRs), advances a cursor, and never stores the token', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    const first = await t.sync(id);
    expect(first.json()).toEqual({ imported: 2, updated: 0, conflicts: 0 });
    expect(t.works().map((w) => w.title)).toEqual(['#1 Fix login', '#2 Add export']);
    expect((await t.sync(id)).json()).toEqual({ imported: 0, updated: 0, conflicts: 0 }); // idempotent
    expect(state.requests.at(-1)!.url).toContain('since=2026-10-02T00%3A00%3A00Z');
    const dump = JSON.stringify(
      t.f.control.ctx.sqlite.prepare('SELECT * FROM integration_connections').all(),
    );
    expect(dump).not.toContain(SECRET);
    expect(dump).toContain('GH_TOKEN'); // only the variable name
    expect(state.requests.every((r) => r.auth === `Bearer ${SECRET}`)).toBe(true);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('applies field ownership: updates unstarted work, records a conflict once work has started, never loops on write-backs', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    await t.sync(id);
    state.issues[0] = {
      ...state.issues[0]!,
      title: 'Fix login (revised)',
      updated_at: '2026-10-03T01:00:00Z',
    };
    expect((await t.sync(id)).json()).toEqual({ imported: 0, updated: 1, conflicts: 0 });
    expect(t.works().map((w) => w.title)).toContain('#1 Fix login (revised)');

    const started = t.works().find((w) => w.title.startsWith('#2'))!;
    seedWork(t.f.control, started.id, "state='running',attempt=1");
    state.issues[1] = {
      ...state.issues[1]!,
      body: 'Changed upstream mid-flight',
      updated_at: '2026-10-03T02:00:00Z',
    };
    expect((await t.sync(id)).json()).toEqual({ imported: 0, updated: 0, conflicts: 1 });
    expect(t.works().find((w) => w.id === started.id)).toMatchObject({
      state: 'running',
      title: '#2 Add export',
    }); // untouched
    const listed = await t.app.inject({
      method: 'GET',
      url: `/api/projects/${t.f.projectId}/integrations`,
      headers: t.headers,
    });
    expect(listed.json().integrations[0]).toMatchObject({
      linked: 2,
      conflicts: 1,
      lastError: null,
    });

    // A write-back that only bumps updated_at (same content) is a no-op, so it cannot loop.
    state.issues[0] = { ...state.issues[0]!, updated_at: '2026-10-03T03:00:00Z' };
    expect((await t.sync(id)).json()).toEqual({ imported: 0, updated: 0, conflicts: 1 });
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('surfaces auth failures and rate limits, and backs off without calling the provider again', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    state.mode = 'unauthorized';
    const denied = await t.sync(id);
    expect(denied.statusCode).toBe(502);
    expect(denied.json().error.code).toBe('INTEGRATION_UNAUTHORIZED');

    state.mode = 'ratelimit';
    state.resetAt = Math.floor(t.now() / 1000) + 3600;
    expect((await t.sync(id)).json().error.code).toBe('INTEGRATION_RATE_LIMITED');
    state.mode = 'ok';
    const before = state.requests.length;
    expect((await t.sync(id)).json().error.code).toBe('INTEGRATION_RATE_LIMITED'); // still backing off
    expect(state.requests.length).toBe(before); // no request was made

    t.advance(2 * 3600_000); // past the reset time
    expect((await t.sync(id)).json()).toMatchObject({ imported: 2 });
    const [row] = t.f.control.ctx.sqlite
      .prepare('SELECT lastError,backoffUntil FROM integration_connections')
      .all() as { lastError: string | null; backoffUntil: number | null }[];
    expect(row).toEqual({ lastError: null, backoffUntil: null });
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('rejects a missing token, an insecure remote base URL, and non-owners', async () => {
  const t = setup();
  try {
    const noToken = t.connect({
      provider: 'github',
      owner: 'acme',
      repo: 'app',
      tokenEnv: 'NOT_SET',
      baseUrl: `http://127.0.0.1:${port}`,
    });
    expect((await t.sync(noToken.id)).json().error.code).toBe('INTEGRATION_TOKEN_MISSING');
    expect(() =>
      t.connect({
        provider: 'github',
        owner: 'acme',
        repo: 'app',
        tokenEnv: 'GH_TOKEN',
        baseUrl: 'http://example.com',
      }),
    ).toThrow('INTEGRATION_BASE_URL_INSECURE');
    expect(() =>
      t.f.control.execute(
        t.f.sender.actor,
        command(
          'integration.connect',
          { provider: 'github', owner: 'a', repo: 'b', tokenEnv: 'GH_TOKEN' },
          t.f.projectId,
        ),
      ),
    ).toThrow('FORBIDDEN');
    const agentSync = await t.app.inject({
      method: 'POST',
      url: `/api/projects/${t.f.projectId}/integrations/${noToken.id}/sync`,
      headers: { authorization: `Bearer ${t.f.sender.token}`, host: '127.0.0.1:4493' },
    });
    expect(agentSync.statusCode).toBe(403);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('posts only accepted results back, tagged so they are recognisable', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    await t.sync(id);
    const work = t.works()[0]!;
    const post = () =>
      t.app.inject({
        method: 'POST',
        url: `/api/projects/${t.f.projectId}/work/${work.id}/post-result`,
        headers: t.headers,
      });
    expect((await post()).json().error.code).toBe('INTEGRATION_REQUIRES_ACCEPTED_WORK');
    seedWork(t.f.control, work.id, "state='completed',result='Fixed in commit abc'");
    expect((await post()).json()).toEqual({ posted: true });
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]!.url).toBe(
      '/repos/acme/app/issues/' + work.title.match(/#(\d+)/)![1] + '/comments',
    );
    expect(state.comments[0]!.body).toContain('Fixed in commit abc');
    expect(state.comments[0]!.body).toContain(`<!-- aether:work:${work.id} -->`);
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('verifies webhook signatures on the raw body, deduplicates deliveries, and only treats the payload as a signal', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    const payload = JSON.stringify({
      action: 'opened',
      issue: { title: 'ignored: state is pulled, not trusted' },
    });
    const sign = (secret: string) =>
      'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    const send = (signature: string, delivery: string, event = 'issues') =>
      t.app.inject({
        method: 'POST',
        url: `/api/webhooks/github/${id}`,
        payload,
        headers: {
          'content-type': 'application/json',
          host: '127.0.0.1:4493',
          'x-hub-signature-256': signature,
          'x-github-delivery': delivery,
          'x-github-event': event,
        },
      });
    expect((await send(sign('wrong'), 'd1')).statusCode).toBe(401);
    expect(t.works()).toHaveLength(0);
    expect((await send(sign('hook-secret'), 'd2')).json()).toEqual({ status: 'synced' });
    expect(t.works().map((w) => w.title)).toEqual(['#1 Fix login', '#2 Add export']); // from the pulled state
    expect((await send(sign('hook-secret'), 'd2')).json()).toEqual({ status: 'duplicate' });
    expect((await send(sign('hook-secret'), 'd3', 'ping')).json()).toEqual({ status: 'ignored' });
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});

it('imports from Linear over GraphQL, surfaces its rate limit, and comments on accepted work', async () => {
  const t = setup();
  try {
    state.linear = [
      {
        id: 'lin-1',
        identifier: 'ENG-7',
        title: 'Speed up CI',
        description: 'Too slow',
        url: 'https://linear.app/x/issue/ENG-7',
        updatedAt: '2026-10-02T00:00:00Z',
      },
    ];
    const { id } = t.connect({
      provider: 'linear',
      teamKey: 'ENG',
      tokenEnv: 'LIN_TOKEN',
      baseUrl: `http://127.0.0.1:${port}`,
    });
    expect((await t.sync(id)).json()).toEqual({ imported: 1, updated: 0, conflicts: 0 });
    expect(state.requests.at(-1)!.auth).toBe('lin_key'); // Linear API keys are sent as-is, not as Bearer
    state.linearRateLimited = true;
    expect((await t.sync(id)).json().error.code).toBe('INTEGRATION_RATE_LIMITED');
    state.linearRateLimited = false;
    t.advance(120_000);
    const work = t.works()[0]!;
    seedWork(t.f.control, work.id, "state='completed',result='Done'");
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: `/api/projects/${t.f.projectId}/work/${work.id}/post-result`,
          headers: t.headers,
        })
      ).json(),
    ).toEqual({ posted: true });
  } finally {
    await t.app.close();
    t.f.control.close();
  }
});
