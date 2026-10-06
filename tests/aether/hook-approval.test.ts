import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer as listen, type Server } from 'node:http';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { approvalsFixture } from './permission-fixtures.js';
import { sleep } from './process-fixtures.js';

const PORT = 4365;
const script = join(process.cwd(), 'packages/providers/src/hook-approval.mjs');

const suggestion = {
  type: 'addRules',
  behavior: 'allow',
  destination: 'localSettings', // Claude offers its own destination; the hook pins the session
  rules: [{ toolName: 'Bash', ruleContent: 'pnpm test:*' }],
};
const payload = (sessionId: string, extra: Record<string, unknown> = {}) => ({
  hook_event_name: 'PermissionRequest',
  session_id: sessionId,
  cwd: '/anywhere',
  tool_name: 'Bash',
  tool_input: { command: 'pnpm test' },
  permission_suggestions: [suggestion, { type: 'setMode', mode: 'bypassPermissions' }],
  ...extra,
});

/** Runs the hook script as Claude Code would: payload on stdin, a config file, a wait deadline. */
function runHook(config: string, stdin: unknown, waitMs: number) {
  const started = Date.now();
  return new Promise<{ code: number | null; out: string; ms: number }>((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        AETHER_APPROVALS_CONFIG: config,
        AETHER_APPROVAL_WAIT_MS: String(waitMs),
      },
    });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', (code) => resolve({ code, out, ms: Date.now() - started }));
    child.stdin.end(JSON.stringify(stdin));
  });
}

it('prints Claude’s decision JSON for a human answer, and only for that', async () => {
  const f = approvalsFixture(PORT);
  const operator = f.control.createIdentity(f.owner.actor, {
    name: 'op',
    role: 'operator',
    projectIds: [f.projectId],
  });
  try {
    await f.enable();
    const browser = await f.signIn(operator.token);
    await f.app.listen({ host: '127.0.0.1', port: PORT });
    const answer = async (body: unknown) => {
      for (let i = 0; i < 100; i++) {
        const { requests } = (
          await f.app.inject({
            method: 'GET',
            url: '/api/permission-requests',
            headers: browser.read,
          })
        ).json() as { requests: { id: string }[] };
        if (requests[0]) {
          const r = await f.app.inject({
            method: 'POST',
            url: `/api/permission-requests/${requests[0].id}/decision`,
            headers: browser.write,
            payload: body as object,
          });
          expect(r.statusCode).toBe(200);
          return;
        }
        await sleep(50);
      }
      throw new Error('no request appeared');
    };

    const allowed = runHook(f.configFile, payload(f.sessionId), 20_000);
    await answer({ decision: 'allow_session' });
    const a = await allowed;
    expect(a.code).toBe(0);
    expect(a.ms).toBeLessThan(5000);
    expect(JSON.parse(a.out)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'allow',
          updatedPermissions: [
            {
              type: 'addRules',
              behavior: 'allow',
              destination: 'session',
              rules: [{ toolName: 'Bash', ruleContent: 'pnpm test:*' }],
            },
          ],
        },
      },
    });

    const denied = runHook(f.configFile, payload(f.sessionId), 20_000);
    await answer({ decision: 'deny', message: 'not now' });
    expect(JSON.parse((await denied).out)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'not now' },
      },
    });

    // A plain allow never carries rules, even though Claude offered some.
    const once = runHook(f.configFile, payload(f.sessionId), 20_000);
    await answer({ decision: 'allow' });
    expect(JSON.parse((await once).out).hookSpecificOutput.decision).toEqual({ behavior: 'allow' });

    // Nobody answers: nothing is printed (Claude asks in its terminal), the request is closed for good.
    const silent = await runHook(f.configFile, payload(f.sessionId), 1500);
    expect(silent).toMatchObject({ code: 0, out: '' });
    expect(silent.ms).toBeGreaterThanOrEqual(1400);
    expect(silent.ms).toBeLessThan(6000);
    const { requests } = (
      await f.app.inject({
        method: 'GET',
        url: '/api/permission-requests',
        headers: browser.read,
      })
    ).json() as { requests: unknown[] };
    expect(requests).toEqual([]); // closed, so a late click cannot be taken for the prompt now on the terminal
  } finally {
    await f.app.close();
    f.control.close();
  }
});

it('falls back to the terminal (prints nothing, exits 0) when the server hangs, is absent, or the config is unusable', async () => {
  const f = approvalsFixture(PORT);
  const dir = f.home;
  const config = (name: string, url: string, token = 't'.repeat(43)) => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify({ url, token }));
    return file;
  };
  // A server that accepts the request and never answers.
  const hung: Server = listen(() => undefined);
  await new Promise<void>((done) => hung.listen(PORT, '127.0.0.1', done));
  try {
    const hang = await runHook(config('hang.json', `http://127.0.0.1:${PORT}`), payload('s'), 2000);
    expect(hang).toMatchObject({ code: 0, out: '' });
    expect(hang.ms).toBeLessThan(8000);
  } finally {
    hung.closeAllConnections();
    await new Promise((done) => hung.close(done));
  }
  // Nothing listens on the port now.
  expect(
    await runHook(config('none.json', `http://127.0.0.1:${PORT}`), payload('s'), 5000),
  ).toMatchObject({ code: 0, out: '' });
  // No config (Remote approvals never switched on), a non-loopback url (the token never leaves the machine), garbage input.
  expect(await runHook(join(dir, 'missing.json'), payload('s'), 5000)).toMatchObject({
    code: 0,
    out: '',
  });
  expect(
    await runHook(config('remote.json', 'http://192.0.2.1:4365'), payload('s'), 5000),
  ).toMatchObject({ code: 0, out: '' });
  expect(
    await runHook(config('ok.json', `http://127.0.0.1:${PORT}`), 'not json', 5000),
  ).toMatchObject({ code: 0, out: '' });
  // Another event is none of this hook's business.
  expect(
    await runHook(
      config('ok.json', `http://127.0.0.1:${PORT}`),
      payload('s', { hook_event_name: 'PreToolUse' }),
      5000,
    ),
  ).toMatchObject({ code: 0, out: '' });
  f.control.close();
});
