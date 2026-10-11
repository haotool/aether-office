import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer as listen, type Server } from 'node:http';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { approvalsFixture } from './permission-fixtures.js';
import { budget, eventually, freePort } from './timing.js';

const script = join(process.cwd(), 'packages/providers/src/hook-approval.mjs');

const suggestion = {
  type: 'addRules',
  behavior: 'allow',
  destination: 'localSettings',
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
  const PORT = await freePort();
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
      const request = await eventually(
        async () => {
          const { requests } = (
            await f.app.inject({
              method: 'GET',
              url: '/api/permission-requests',
              headers: browser.read,
            })
          ).json() as { requests: { id: string }[] };
          return requests[0];
        },
        30_000,
        'the hook’s permission request',
      );
      const r = await f.app.inject({
        method: 'POST',
        url: `/api/permission-requests/${request.id}/decision`,
        headers: browser.write,
        payload: body as object,
      });
      expect(r.statusCode).toBe(200);
    };

    const allowed = runHook(f.configFile, payload(f.sessionId), 20_000);
    await answer({ decision: 'allow_session' });
    const a = await allowed;
    expect(a.code).toBe(0);
    expect(a.ms).toBeLessThan(budget(5000, 19_000));
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

    const silent = await runHook(f.configFile, payload(f.sessionId), 1500);
    expect(silent).toMatchObject({ code: 0, out: '' });
    expect(silent.ms).toBeGreaterThanOrEqual(1400);
    expect(silent.ms).toBeLessThan(budget(6000, 25_000)); // it gave up at its deadline (1.5 s), not on some later timeout
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
}, 90_000);

it('falls back to the terminal (prints nothing, exits 0) when the server hangs, is absent, or the config is unusable', async () => {
  const PORT = await freePort();
  const f = approvalsFixture(PORT);
  const dir = f.home;
  const config = (name: string, url: string, token = 't'.repeat(43)) => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify({ url, token }));
    return file;
  };
  const hung: Server = listen(() => undefined);
  await new Promise<void>((done) => hung.listen(PORT, '127.0.0.1', done));
  try {
    const hang = await runHook(config('hang.json', `http://127.0.0.1:${PORT}`), payload('s'), 2000);
    expect(hang).toMatchObject({ code: 0, out: '' });
    expect(hang.ms).toBeLessThan(budget(8000, 30_000));
  } finally {
    hung.closeAllConnections();
    await new Promise((done) => hung.close(done));
  }
  expect(
    await runHook(config('none.json', `http://127.0.0.1:${PORT}`), payload('s'), 5000),
  ).toMatchObject({ code: 0, out: '' });
  // No config (Remote approvals never switched on), a non-loopback url (the token never leaves the machine), garbage input.
  expect(await runHook(join(dir, 'missing.json'), payload('s'), 5000)).toMatchObject({
    code: 0,
    out: '',
  });
  expect(
    await runHook(config('remote.json', `http://192.0.2.1:${PORT}`), payload('s'), 5000),
  ).toMatchObject({ code: 0, out: '' });
  expect(
    await runHook(config('ok.json', `http://127.0.0.1:${PORT}`), 'not json', 5000),
  ).toMatchObject({ code: 0, out: '' });
  expect(
    await runHook(
      config('ok.json', `http://127.0.0.1:${PORT}`),
      payload('s', { hook_event_name: 'PreToolUse' }),
      5000,
    ),
  ).toMatchObject({ code: 0, out: '' });
  f.control.close();
}, 60_000);
