import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer as listen, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { approvalProof } from '../../packages/providers/src/approval-config.mjs';
import { approvalChannel } from '../../apps/control/src/services/remote/remote-approvals.js';
import { pruneAttempts } from '../../apps/control/src/services/runtime/attempts.js';
import { approvalsFixture } from './permission-fixtures.js';
import { freePort } from './timing.js';

const PORT = await freePort();
const NONCE = 'n'.repeat(24);
const script = join(process.cwd(), 'packages/providers/src/hook-approval.mjs');
const KEY = 'k'.repeat(43);
const payload = (extra: Record<string, unknown> = {}) => ({
  hook_event_name: 'PermissionRequest',
  session_id: 's',
  cwd: '/anywhere',
  tool_name: 'Bash',
  tool_input: { command: 'rm -rf /tmp/x' },
  ...extra,
});

function runHook(config: string, stdin: unknown, waitMs = 5000) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        AETHER_APPROVALS_CONFIG: config,
        AETHER_APPROVAL_WAIT_MS: `${waitMs}`,
      },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('close', (code) => resolve({ code, out, err }));
    child.stdin.end(JSON.stringify(stdin));
  });
}

const servers: Server[] = [];
const closeAll = async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise((done) => s.close(done));
  }
};
afterEach(closeAll);
/** Listens on `port` (0: any free one) and resolves to the port taken. */
const serve = (port: number, handler: Parameters<typeof listen>[1]) =>
  new Promise<number>((done) => {
    const s = listen(handler);
    servers.push(s);
    s.listen(port, '127.0.0.1', () => done((s.address() as { port: number }).port));
  });
const tmp = () => mkdtempSync(join(tmpdir(), 'aether-hardening-'));
const configIn = (dir: string) => {
  const file = join(dir, 'approvals.json');
  writeFileSync(
    file,
    JSON.stringify({ url: `http://127.0.0.1:${PORT}`, token: 't'.repeat(43), verifyKey: KEY }),
  );
  return file;
};

/** A process squatting the port: it answers the create and every poll with an allow that `sign` may sign. */
const squatter = (sign: (id: string, nonce: string) => Record<string, unknown>) =>
  serve(PORT, (request, response) => {
    let body = '';
    request.on('data', (c: Buffer) => (body += c.toString()));
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      const url = new URL(request.url!, 'http://x');
      if (request.method === 'POST' && url.pathname === '/api/hook/permission-requests')
        return void response.end(JSON.stringify({ id: 'req-1', expiresAt: 0 }));
      const nonce =
        url.searchParams.get('nonce') ?? (JSON.parse(body || '{}') as { nonce?: string }).nonce;
      response.end(
        JSON.stringify({
          state: 'allowed',
          decision: { behavior: 'allow', sessionRules: false },
          ...sign('req-1', nonce ?? ''),
        }),
      );
    });
  });

it('trusts only a decision the real server signed: an unsigned, wrongly signed or mis-bound allow prints nothing', async () => {
  const config = configIn(tmp());
  const fields = { behavior: 'allow' as const, sessionRules: false };
  await squatter(() => ({})); // an unsigned allow
  expect(await runHook(config, payload())).toMatchObject({ code: 0, out: '', err: '' });
  await closeAll();
  await squatter((id, nonce) => ({
    proof: approvalProof('x'.repeat(43), { id, nonce, ...fields }), // a key it does not have
  }));
  expect(await runHook(config, payload())).toMatchObject({ code: 0, out: '' });
  await closeAll();
  await squatter((id, nonce) => ({
    proof: approvalProof(KEY, { id, nonce, behavior: 'deny', sessionRules: false }), // another answer
  }));
  expect(await runHook(config, payload())).toMatchObject({ code: 0, out: '' });
  await closeAll();
  await squatter((id, nonce) => ({ proof: approvalProof(KEY, { id, nonce, ...fields }) }));
  const ok = await runHook(config, payload()); // the holder of the key
  expect(JSON.parse(ok.out).hookSpecificOutput.decision).toEqual({ behavior: 'allow' });
});

it('never follows a redirect', async () => {
  let reached = 0;
  const target = await serve(0, (_q, r) => {
    reached += 1;
    r.end('{}');
  });
  await serve(PORT, (_q, r) => {
    r.writeHead(307, { location: `http://127.0.0.1:${target}/` }).end();
  });
  expect(await runHook(configIn(tmp()), payload())).toMatchObject({ code: 0, out: '' });
  expect(reached).toBe(0);
});

const createRequest = (f: ReturnType<typeof approvalsFixture>, token: string, extra = {}) =>
  f.app.inject({
    method: 'POST',
    url: '/api/hook/permission-requests',
    headers: { ...f.as(token), 'content-type': 'application/json' },
    payload: JSON.stringify({
      sessionId: f.sessionId,
      cwd: f.repo,
      tool: 'Bash',
      input: { command: 'ls' },
      rules: ['Bash(ls:*)'],
      waitMs: 30_000,
      nonce: NONCE,
      ...extra,
    }),
  });

it('the real server signs a decision for the nonce it was given, and the key follows the file', async () => {
  const f = approvalsFixture(PORT);
  try {
    await f.enable();
    expect(statSync(f.configFile).mode & 0o777).toBe(0o600);
    const first = f.readConfig();
    expect(first.verifyKey.length).toBeGreaterThanOrEqual(32);
    const { id } = (await createRequest(f, first.token)).json() as { id: string };
    const poll = (query: string) =>
      f.app.inject({
        method: 'GET',
        url: `/api/hook/permission-requests/${id}${query}`,
        headers: f.as(first.token),
      });
    expect((await poll('')).statusCode).toBe(400); // a nonce is required
    expect(((await poll(`?nonce=${NONCE}`)).json() as { proof?: string }).proof).toBeUndefined();
    const browser = await f.signIn(f.owner.token);
    await f.app.inject({
      method: 'POST',
      url: `/api/permission-requests/${id}/decision`,
      headers: browser.write,
      payload: { decision: 'allow_session' },
    });
    const { proof } = (await poll(`?nonce=${NONCE}`)).json() as { proof: string };
    const bound = { id, nonce: NONCE, behavior: 'allow' as const, sessionRules: true };
    expect(proof).toBe(approvalProof(first.verifyKey, bound));
    expect(proof).not.toBe(approvalProof(first.verifyKey, { ...bound, nonce: 'o'.repeat(24) }));
    await f.enable(); // switching on again rotates the key
    expect(f.readConfig().verifyKey).not.toBe(first.verifyKey);
    await f.app.inject({
      method: 'PUT',
      url: '/api/remote-approvals',
      headers: f.as(f.owner.token),
      payload: { enabled: false },
    });
    expect(existsSync(f.configFile)).toBe(false); // the key goes with the file
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('a decision needs a browser session with CSRF: neither an owner bearer token nor a missing CSRF token decides', async () => {
  const f = approvalsFixture(PORT);
  try {
    await f.enable();
    const { id } = (await createRequest(f, f.readConfig().token)).json() as { id: string };
    const url = `/api/permission-requests/${id}/decision`;
    const post = (headers: Record<string, string>) =>
      f.app.inject({ method: 'POST', url, headers, payload: { decision: 'allow' } });
    const list = (headers: Record<string, string>) =>
      f.app.inject({ method: 'GET', url: '/api/permission-requests', headers });
    // The token an agent could read from .data/live/owner-token.
    expect((await post(f.as(f.owner.token))).statusCode).toBe(403);
    expect((await list(f.as(f.owner.token))).statusCode).toBe(403);
    const browser = await f.signIn(f.owner.token);
    expect((await post(browser.read)).statusCode).toBe(403); // no CSRF token
    // A cookie together with a bearer header is still a bearer request.
    const both = { ...browser.write, authorization: `Bearer ${f.owner.token}` };
    expect((await post(both)).statusCode).toBe(403);
    expect((await list(browser.read)).statusCode).toBe(200);
    expect((await post(browser.write)).statusCode).toBe(200);
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('a correct hook token is never locked out; wrong ones are, and only loopback callers reach the hook routes', async () => {
  const f = approvalsFixture(PORT);
  try {
    await f.enable();
    const { token } = f.readConfig();
    const poll = (bearer: string, remoteAddress?: string) =>
      f.app.inject({
        method: 'GET',
        url: `/api/hook/permission-requests/x?nonce=${NONCE}`,
        headers: f.as(bearer),
        ...(remoteAddress ? { remoteAddress } : {}),
      });
    for (let i = 0; i < 10; i++) expect((await poll('g'.repeat(43))).statusCode).toBe(401);
    expect((await poll('g'.repeat(43))).statusCode).toBe(429);
    expect((await poll(token)).statusCode).toBe(404); // authenticated: only the unknown id is wrong
    for (const near of ['127.0.0.2', '::1', '::ffff:127.0.0.1'])
      expect((await poll(token, near)).statusCode).toBe(404);
    for (const far of ['192.168.1.9', '10.0.0.4', '::ffff:192.168.1.9', '2001:db8::1'])
      expect((await poll(token, far)).statusCode).toBe(403);
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('the failed-attempts map is pruned and capped', () => {
  const map = new Map<string, { count: number; until: number }>();
  for (let i = 0; i < 3000; i++) map.set(`old:${i}`, { count: 1, until: 5 });
  for (let i = 0; i < 1500; i++) map.set(`live:${i}`, { count: 1, until: 1000 });
  pruneAttempts(map, 100, 1000);
  expect(map.size).toBe(1000);
  expect([...map.keys()].some((k) => k.startsWith('old:'))).toBe(false);
  expect(map.has('live:1499')).toBe(true); // the newest survive
});

it('checks the rate limit before it scans for the session project', async () => {
  const f = approvalsFixture(PORT);
  try {
    await f.enable();
    for (let i = 0; i < 20; i++)
      f.control.permissionRequests.create({
        sessionKey: `claude:fill${i}`,
        projectId: 'p',
        tool: 'Bash',
        input: {},
        rules: [],
        waitMs: 30_000,
      });
    const response = await createRequest(f, f.readConfig().token, { sessionId: 'unknown-session' });
    expect(response.statusCode).toBe(429); // not 404: the scan was never made
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('offers "allow for this session" only for rules the server will show whole', async () => {
  const f = approvalsFixture(PORT);
  try {
    await f.enable();
    await f.app.listen({ host: '127.0.0.1', port: PORT });
    const browser = await f.signIn(f.owner.token);
    const long = {
      type: 'addRules',
      behavior: 'allow',
      destination: 'localSettings',
      rules: [{ toolName: 'Bash', ruleContent: `${'a'.repeat(200)}:*` }],
    };
    const running = runHook(
      f.configFile,
      payload({ session_id: f.sessionId, permission_suggestions: [long] }),
      20_000,
    );
    let shown: { id: string; sessionRules: string[] } | undefined;
    for (let i = 0; i < 100 && !shown; i++) {
      const list = (
        await f.app.inject({
          method: 'GET',
          url: '/api/permission-requests',
          headers: browser.read,
        })
      ).json() as { requests: { id: string; sessionRules: string[] }[] };
      shown = list.requests[0];
      if (!shown) await new Promise((done) => setTimeout(done, 50));
    }
    expect(shown).toBeDefined(); // the request was not rejected for its long label
    expect(shown!.sessionRules).toEqual([]);
    await f.app.inject({
      method: 'POST',
      url: `/api/permission-requests/${shown!.id}/decision`,
      headers: browser.write,
      payload: { decision: 'allow' },
    });
    expect(JSON.parse((await running).out).hookSpecificOutput.decision).toEqual({
      behavior: 'allow',
    });
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('writes approvals.json privately: a 0700 directory even when it exists, and no symlinks', async () => {
  const f = approvalsFixture(PORT);
  try {
    const dot = join(f.home, 'dot-aether');
    mkdirSync(dot, { mode: 0o755 });
    chmodSync(dot, 0o755);
    const file = join(dot, 'approvals.json');
    process.env['AETHER_APPROVALS_CONFIG'] = file;
    await f.enable();
    expect(statSync(dot).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    // A link planted where the file goes is refused, and what it points to is left alone.
    const target = join(f.home, 'victim');
    writeFileSync(target, 'keep');
    const planted = join(dot, 'planted.json');
    symlinkSync(target, planted);
    process.env['AETHER_APPROVALS_CONFIG'] = planted;
    expect((await f.enable()).statusCode).toBeGreaterThanOrEqual(400);
    expect(readFileSync(target, 'utf8')).toBe('keep');
    // So is a linked directory.
    const linked = join(f.home, 'linked');
    symlinkSync(dot, linked);
    process.env['AETHER_APPROVALS_CONFIG'] = join(linked, 'approvals.json');
    expect((await f.enable()).statusCode).toBeGreaterThanOrEqual(400);
    expect(lstatSync(linked).isSymbolicLink()).toBe(true);
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('only loopback or HTTPS carries an answer unless the LAN opt-in is set', async () => {
  const https = new URL('https://aether.example');
  const http = new URL(`http://192.168.1.20:${PORT}`);
  const on = { AETHER_REMOTE_APPROVALS_LAN: '1' };
  expect(approvalChannel(http, `127.0.0.1:${PORT}`, {})).toBe('ok');
  expect(approvalChannel(http, `localhost:${PORT}`, {})).toBe('ok');
  expect(approvalChannel(http, `[::1]:${PORT}`, {})).toBe('ok');
  expect(approvalChannel(https, 'aether.example', {})).toBe('ok');
  expect(approvalChannel(http, `192.168.1.20:${PORT}`, {})).toBe('blocked');
  expect(approvalChannel(http, `192.168.1.20:${PORT}`, on)).toBe('lan-opt-in');
  expect(approvalChannel(http, `192.168.1.20:${PORT}`, { AETHER_REMOTE_APPROVALS_LAN: '0' })).toBe(
    'blocked',
  );

  const f = approvalsFixture(PORT, 'sess-one', { lan: true });
  try {
    await f.enable();
    const { id } = (await createRequest(f, f.readConfig().token)).json() as { id: string };
    const phone = await f.signIn(f.owner.token);
    const lan = `192.168.1.20:${PORT}`;
    const decide = () =>
      f.app.inject({
        method: 'POST',
        url: `/api/permission-requests/${id}/decision`,
        headers: { ...phone.write, host: lan },
        payload: { decision: 'allow' },
      });
    const state = () =>
      f.app.inject({
        method: 'GET',
        url: '/api/remote-approvals',
        headers: { ...phone.read, host: lan },
      });
    expect((await decide()).statusCode).toBe(403);
    expect((await state()).json()).toMatchObject({ enabled: true, channel: 'blocked' });
    process.env['AETHER_REMOTE_APPROVALS_LAN'] = '1';
    try {
      expect((await state()).json()).toMatchObject({ channel: 'lan-opt-in' });
      expect((await decide()).statusCode).toBe(200);
    } finally {
      delete process.env['AETHER_REMOTE_APPROVALS_LAN'];
    }
  } finally {
    await f.app.close();
    f.control.close();
  }
});
