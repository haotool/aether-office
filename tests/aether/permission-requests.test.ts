import { existsSync, readFileSync, statSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createPermissionRequests } from '../../apps/control/src/services/permissions/permission-requests.js';
import { redactSecrets } from '../../apps/control/src/services/platform/redaction.js';
import { summarize } from '../../apps/control/src/services/permissions/permission-summary.js';
import { approvalsFixture } from './permission-fixtures.js';

it('summarizes a tool call: redacted, bounded, and never the raw input', () => {
  const secret = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
  const bash = summarize('Bash', {
    command: `curl -H "Authorization: Bearer ${secret}" https://x.test\nrm -rf build ${'x'.repeat(5000)}`,
    description: 'fetch',
  });
  expect(bash.summary).not.toContain(secret);
  expect(bash.preview).not.toContain(secret);
  expect(bash.summary.length).toBeLessThanOrEqual(140);
  expect(bash.preview!.length).toBeLessThanOrEqual(1200);
  const edit = summarize('Edit', {
    file_path: '/w/app.ts',
    old_string: 'const a = 1',
    new_string: 'const a = 2',
  });
  expect(edit).toEqual({
    summary: '/w/app.ts',
    preview: '- const a = 1\n+ const a = 2',
    needsReview: true,
  });
  expect(summarize('Write', { file_path: '/w/a', content: 'one\ntwo' }).preview).toBe(
    '+ one\n+ two',
  );
  expect(summarize('Mystery', 'not an object')).toEqual({
    summary: 'Mystery',
    preview: null,
    needsReview: false,
  });
});

it('shows every part of what a person is asked to allow', () => {
  const multi = summarize('Bash', { command: 'ls\nrm -rf build', description: 'list files' });
  expect(multi.needsReview).toBe(true);
  expect(multi.preview).toBe('ls\nrm -rf build\nlist files');
  expect(summarize('Bash', { command: 'pnpm test', description: 'x' }).needsReview).toBe(false);
  expect(summarize('Bash', { command: 'x'.repeat(500) }).needsReview).toBe(true);
  expect(summarize('Mystery', { a: 1 }).needsReview).toBe(true);
  expect(summarize('Mystery', {}).needsReview).toBe(false);

  const edits = summarize('MultiEdit', {
    file_path: '/w/app.ts',
    edits: [
      { old_string: 'a', new_string: 'b' },
      { old_string: 'secure()', new_string: 'insecure()', replace_all: true },
    ],
  });
  expect(edits.summary).toBe('/w/app.ts (+1 edits)');
  expect(edits.preview).toContain('insecure()');
  expect(edits.preview).toContain('replace all');
  expect(edits.needsReview).toBe(true);
  expect(
    summarize('Edit', { file_path: '/w/a', old_string: 'x', new_string: 'y', replace_all: true })
      .preview,
  ).toBe('(replace all)\n- x\n+ y');

  // Direction overrides and zero-width characters cannot disguise a command, nor hide a secret from redaction.
  const disguised = summarize('Bash', { command: 'echo ‮ok​\u0085 ⁦;ls⁩' });
  expect(disguised.summary).toBe('echo ok ;ls');
  const split = 'ghp_abcdefghijklmnop​qrstuvwxyz0123456789';
  expect(summarize('Bash', { command: `echo ${split}` }).summary).not.toContain('ghp_');
});

it('redacts JSON-style and environment-style secrets, and structured input by key name', () => {
  for (const text of [
    '{"password": "hunter2hunter2"}',
    '{"api_key":"abc123abc123"}',
    "{'client_secret': 'abc123abc123'}",
    'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG',
    'PGPASSWORD=hunter2 psql',
    'MY_TOKEN=abc123abc123 run',
    'export GITHUB_TOKEN="abc 123"',
  ])
    expect(redactSecrets(text), text).not.toMatch(/hunter2|abc123|wJalr|abc 123/);
  expect(redactSecrets('token=abc123')).toBe('token=[redacted]');
  expect(redactSecrets('curl https://u:p@host/x')).toBe(
    'curl https://[redacted-credential]@host/x',
  );
  expect(redactSecrets('Bearer abcdefghijklmnopqrstuvwxyz')).toBe('[redacted-secret]');
  expect(redactSecrets('ls -la /tmp/passwords.txt')).toContain('passwords.txt');
  expect(redactSecrets('x'.repeat(20000))).toHaveLength(20000);
  const out = summarize('Mystery', {
    password: { nested: 'hunter2' },
    list: [{ MY_TOKEN: 'abc123' }],
    plain: 'visible',
  });
  expect(out.preview).toContain('visible');
  expect(out.preview).not.toMatch(/hunter2|abc123/);
});

it('keeps a bounded store: ttl, per-session and global caps, rate limit, one answer', async () => {
  let now = 1_000_000;
  const store = createPermissionRequests(() => now);
  const make = (session = 'claude:a', waitMs = 45_000) =>
    store.create({
      sessionKey: session,
      projectId: 'p',
      tool: 'Bash',
      input: { command: 'ls' },
      rules: ['Bash(ls:*)'],
      waitMs,
    });
  const first = make();
  expect(first).toMatchObject({ state: 'pending', expiresAt: now + 45_000 });
  expect(store.list()).toHaveLength(1);
  expect(store.decide(first.id, { decision: 'allow' }).state).toBe('allowed');
  expect(store.decide(first.id, { decision: 'allow' }).state).toBe('allowed');
  expect(() => store.decide(first.id, { decision: 'deny' })).toThrow(/PERMISSION_REQUEST_CLOSED/);
  expect(store.list()).toHaveLength(0);

  const second = make();
  now += 46_000;
  expect(store.get(second.id).state).toBe('expired');
  expect(() => store.decide(second.id, { decision: 'allow' })).toThrow(/PERMISSION_REQUEST_CLOSED/);
  now += 6 * 60_000;
  expect(() => store.get(second.id)).toThrow(/NOT_FOUND/);

  const third = make('claude:b');
  expect(store.fallback(third.id).state).toBe('fallback');
  expect(() => store.decide(third.id, { decision: 'allow' })).toThrow(/CLOSED/);

  const noRules = store.create({
    sessionKey: 'claude:z',
    projectId: 'p',
    tool: 'Bash',
    input: {},
    rules: [],
    waitMs: 9000,
  }).id;
  expect(() => store.decide(noRules, { decision: 'allow_session' })).toThrow(
    /SESSION_RULES_NOT_OFFERED/,
  );
  store.fallback(noRules);
  for (let i = 0; i < 5; i++) make('claude:c');
  expect(() => make('claude:c')).toThrow(/PERMISSION_RATE_LIMIT/);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) make(`claude:d${i}`);
  expect(store.list()).toHaveLength(20);
  expect(() => make('claude:e')).toThrow(/PERMISSION_RATE_LIMIT/);
});

it('long-poll wakes on a decision', async () => {
  const store = createPermissionRequests(Date.now);
  const r = store.create({
    sessionKey: 'claude:a',
    projectId: 'p',
    tool: 'Bash',
    input: {},
    rules: [],
    waitMs: 30_000,
  });
  const started = Date.now();
  const waiting = store.waitFor(r.id, 10_000);
  setTimeout(() => store.decide(r.id, { decision: 'deny', message: 'no' }), 50);
  await waiting;
  expect(Date.now() - started).toBeLessThan(2000);
  expect(store.outcome(r.id)).toMatchObject({
    state: 'denied',
    decision: { behavior: 'deny', message: 'no' },
  });
});

it('is off by default; the hook token only creates and reads; only a human owner or operator decides; it is audited', async () => {
  const f = approvalsFixture(5688);
  try {
    const hookPost = (token: string, payload: unknown = {}) =>
      f.app.inject({
        method: 'POST',
        url: '/api/hook/permission-requests',
        headers: { ...f.as(token), 'content-type': 'application/json' },
        payload: JSON.stringify(payload),
      });
    const body = {
      sessionId: f.sessionId,
      cwd: f.repo,
      tool: 'Bash',
      input: { command: 'pnpm test' },
      rules: ['Bash(pnpm test:*)'],
      waitMs: 30_000,
      nonce: 'n'.repeat(24),
    };
    expect((await hookPost('x'.repeat(43), body)).statusCode).toBe(401);
    expect(existsSync(f.configFile)).toBe(false);
    expect(
      (
        await f.app.inject({
          method: 'GET',
          url: '/api/remote-approvals',
          headers: f.as(f.owner.token),
        })
      ).json(),
    ).toEqual({ enabled: false, channel: 'ok' });

    // only an owner switches it on; an agent credential cannot
    const refused = await f.app.inject({
      method: 'PUT',
      url: '/api/remote-approvals',
      headers: f.as(f.sender.token),
      payload: { enabled: true },
    });
    expect(refused.statusCode).toBe(403);
    expect((await f.enable()).json()).toEqual({ enabled: true, channel: 'ok' });
    expect(statSync(f.configFile).mode & 0o777).toBe(0o600);
    const token = f.hookToken();
    expect(readFileSync(f.configFile, 'utf8')).toContain(`"url":"http://127.0.0.1:5688"`);

    // the owner's own token is not a hook token, and a hook token is not a login
    expect((await hookPost(f.owner.token, body)).statusCode).toBe(401);
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/permission-requests', headers: f.as(token) }))
        .statusCode,
    ).toBe(401);
    expect(
      (await f.app.inject({ method: 'GET', url: '/api/local-sessions', headers: f.as(token) }))
        .statusCode,
    ).toBe(401);

    expect((await hookPost(token, { ...body, sessionId: 'nobody' })).statusCode).toBe(404);
    const created = await hookPost(token, body);
    expect(created.statusCode).toBe(200);
    const { id } = created.json() as { id: string };

    const list = async (who: string) =>
      f.app.inject({
        method: 'GET',
        url: '/api/permission-requests',
        headers: (await f.signIn(who)).read,
      });
    const operator = f.control.createIdentity(f.owner.actor, {
      name: 'op',
      role: 'operator',
      projectIds: [f.projectId],
    });
    const viewer = f.control.createIdentity(f.owner.actor, {
      name: 'v',
      role: 'viewer',
      projectIds: [f.projectId],
    });
    expect((await list(viewer.token)).statusCode).toBe(403);
    const seen = (await list(operator.token)).json() as {
      requests: { id: string; summary: string; sessionRules: string[] }[];
      enabled: boolean;
    };
    expect(seen.enabled).toBe(true);
    expect(seen.requests).toHaveLength(1);
    expect(seen.requests[0]).toMatchObject({
      summary: 'pnpm test',
      sessionRules: ['Bash(pnpm test:*)'],
    });

    const decide = async (who: string, payload: object) =>
      f.app.inject({
        method: 'POST',
        url: `/api/permission-requests/${id}/decision`,
        headers: (await f.signIn(who)).write,
        payload,
      });
    expect((await decide(viewer.token, { decision: 'allow' })).statusCode).toBe(403);
    expect((await decide(operator.token, { decision: 'maybe' })).statusCode).toBe(400);
    expect((await decide(operator.token, { decision: 'allow', extra: 1 })).statusCode).toBe(400);
    const polled = () =>
      f.app.inject({
        method: 'GET',
        url: `/api/hook/permission-requests/${id}?nonce=${'n'.repeat(24)}`,
        headers: f.as(token),
      });
    expect((await polled()).json()).toMatchObject({ state: 'pending', decision: null });

    expect((await decide(operator.token, { decision: 'allow_session' })).statusCode).toBe(200);
    expect((await decide(operator.token, { decision: 'allow_session' })).statusCode).toBe(200);
    expect((await decide(operator.token, { decision: 'deny' })).statusCode).toBe(409);
    expect((await polled()).json()).toMatchObject({
      state: 'allowed',
      decision: { behavior: 'allow', sessionRules: true },
    });

    const audit = f.control.ctx.sqlite
      .prepare("SELECT actorId,payload FROM events WHERE type='permission-request.decided'")
      .all() as { actorId: string; payload: string }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(operator.actor.id);
    expect(audit[0]!.payload).not.toContain('pnpm test');

    expect(
      (
        await f.app.inject({
          method: 'PUT',
          url: '/api/remote-approvals',
          headers: f.as(f.owner.token),
          payload: { enabled: false },
        })
      ).statusCode,
    ).toBe(200);
    expect(existsSync(f.configFile)).toBe(false);
    expect((await polled()).statusCode).toBe(401);
    expect(((await list(operator.token)).json() as { enabled: boolean }).enabled).toBe(false);
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('rate-limits a caller that guesses the hook token', async () => {
  const f = approvalsFixture(5688);
  try {
    await f.enable();
    const guess = () =>
      f.app.inject({
        method: 'GET',
        url: '/api/hook/permission-requests/x?nonce=nnnnnnnnnnnnnnnn',
        headers: f.as('g'.repeat(43)),
      });
    for (let i = 0; i < 10; i++) expect((await guess()).statusCode).toBe(401);
    expect((await guess()).statusCode).toBe(429);
    // The right token is compared first, so guessers cannot lock the hook out.
    const right = await f.app.inject({
      method: 'GET',
      url: '/api/hook/permission-requests/x?nonce=nnnnnnnnnnnnnnnn',
      headers: f.as(f.hookToken()),
    });
    expect(right.statusCode).toBe(404);
  } finally {
    await f.app.close();
    f.control.close();
  }
});
