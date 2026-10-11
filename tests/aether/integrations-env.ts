import http from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { command, fixture } from './fixture.js';

type Issue = {
  id: number;
  number: number;
  title: string;
  body: string;
  updated_at: string;
  pull_request?: object;
};
export const state = {
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
  resetAt: 0,
};
let server: http.Server;
export let port: number;

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

export const SECRET = 'ghp_super_secret_token_value';
export function setup() {
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
