import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/runtime/local-sessions.js';
import { command, fixture } from './fixture.js';
import { alive, untilAsync } from './process-fixtures.js';

const DAY = 24 * 3_600_000;

it('clocks out for an owner only, with an idempotency key, and never touches a session that is in use', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aether-clockout-api-')));
  const bin = join(home, 'bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'claude'));
  const busy = join(home, 'work', 'busy');
  mkdirSync(busy, { recursive: true });
  execFileSync('git', ['-C', busy, 'init', '-q']);
  execFileSync('git', [
    ...['-C', busy, '-c', 'user.email=a@b', '-c', 'user.name=x'],
    ...['commit', '-q', '--allow-empty', '-m', 'i'],
  ]);
  const folder = join(home, '.claude/projects', busy.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'busy-one.jsonl'), `${JSON.stringify({ type: 'user', cwd: busy })}\n`);
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  const inUse = spawn(join(bin, 'claude'), ['-e', 'setInterval(()=>{},1000)', '--', '-p'], {
    cwd: busy,
    stdio: 'ignore',
  });
  const f = fixture();
  f.control.execute(f.owner.actor, command('project.create', { name: busy, root: busy }));
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4504' });
  try {
    const post = (token: string, body: unknown, key?: string) =>
      app.inject({
        method: 'POST',
        url: '/api/local-sessions/clock-out',
        headers: {
          host: '127.0.0.1:4504',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(key ? { 'idempotency-key': key } : {}),
        },
        payload: JSON.stringify(body),
      });
    const list = async () => {
      resetLocalSessionCache();
      return (
        await app.inject({
          method: 'GET',
          url: '/api/local-sessions',
          headers: { host: '127.0.0.1:4504', authorization: `Bearer ${f.owner.token}` },
        })
      ).json() as { sessions: { key: string; liveness: { startedAt: number } }[] };
    };
    expect(
      await untilAsync(async () =>
        (await list()).sessions.some((s) => s.key === 'claude:busy-one' && s.liveness.startedAt),
      ),
    ).toBe(true);
    const used = (await list()).sessions.find((s) => s.key === 'claude:busy-one')!;
    const body = {
      minIdleMs: DAY,
      sessions: [{ key: used.key, startedAt: used.liveness.startedAt }],
    };
    expect((await post(f.sender.token, body, 'key-owner-only')).statusCode).toBe(403);
    expect((await post(f.owner.token, body)).statusCode).toBe(400);
    expect(
      (await post(f.owner.token, { ...body, minIdleMs: 1000 }, 'key-too-short')).statusCode,
    ).toBe(400);
    expect(
      (
        await post(
          f.owner.token,
          { ...body, sessions: [{ key: '../x', startedAt: 1 }] },
          'key-bad-session',
        )
      ).statusCode,
    ).toBe(400);
    const first = await post(f.owner.token, body, 'key-first-call');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      results: [{ key: used.key, outcome: 'skipped', reason: 'active' }],
    });
    expect((await post(f.owner.token, body, 'key-first-call')).json()).toEqual(first.json());
    const other = { ...body, minIdleMs: 2 * DAY };
    const conflict = await post(f.owner.token, other, 'key-first-call');
    expect(conflict.statusCode).toBe(409);
    expect(JSON.stringify(conflict.json())).toContain('IDEMPOTENCY_CONFLICT');
    expect(alive(inUse.pid!)).toBe(true);
  } finally {
    inUse.kill('SIGKILL');
    delete process.env['AETHER_LOCAL_SESSIONS_HOME'];
    resetLocalSessionCache();
    await app.close();
  }
}, 60000);
