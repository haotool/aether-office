import { expect, it } from 'vitest';
import { command, seedWork } from './fixture.js';
import { SECRET, port, setup, state } from './integrations-env.js';

it('imports issues once (skipping PRs), advances a cursor, and never stores the token', async () => {
  const t = setup();
  try {
    const { id } = t.github();
    const first = await t.sync(id);
    expect(first.json()).toEqual({ imported: 2, updated: 0, conflicts: 0 });
    expect(t.works().map((w) => w.title)).toEqual(['#1 Fix login', '#2 Add export']);
    expect((await t.sync(id)).json()).toEqual({ imported: 0, updated: 0, conflicts: 0 });
    expect(state.requests.at(-1)!.url).toContain('since=2026-10-02T00%3A00%3A00Z');
    const dump = JSON.stringify(
      t.f.control.ctx.sqlite.prepare('SELECT * FROM integration_connections').all(),
    );
    expect(dump).not.toContain(SECRET);
    expect(dump).toContain('GH_TOKEN');
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
    });
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
    expect((await t.sync(id)).json().error.code).toBe('INTEGRATION_RATE_LIMITED');
    expect(state.requests.length).toBe(before);

    t.advance(2 * 3600_000);
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
