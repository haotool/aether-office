import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/runtime/local-sessions.js';
import { command, fixture } from './fixture.js';
import { alive, until, untilAsync } from './process-fixtures.js';

async function orphanClaude(bin: string, cwd: string): Promise<number> {
  const script = `const c=require('node:child_process').spawn(${JSON.stringify(join(bin, 'claude'))},['-e','setInterval(()=>{},1000)','--','-p'],{cwd:${JSON.stringify(cwd)},detached:true,stdio:'ignore'});console.log(c.pid);c.unref()`;
  const middle = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  middle.stdout.on('data', (d) => (out += d));
  await new Promise((r) => middle.once('close', r));
  return Number(out.trim());
}

it('stops an orphaned session for its owner only, by the process the person saw, and refuses a session that is in use', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aether-stop-api-')));
  const bin = join(home, 'bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'claude'));
  const repo = join(home, 'work', 'repo');
  const busy = join(home, 'work', 'busy');
  for (const dir of [repo, busy]) {
    mkdirSync(dir, { recursive: true });
    execFileSync('git', ['-C', dir, 'init', '-q']);
    execFileSync('git', [
      '-C',
      dir,
      '-c',
      'user.email=a@b',
      '-c',
      'user.name=x',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'i',
    ]);
  }
  const folder = (dir: string) => join(home, '.claude/projects', dir.replace(/[^A-Za-z0-9]/g, '-'));
  for (const [dir, id] of [
    [repo, 'orphaned-one'],
    [busy, 'busy-one'],
  ] as const) {
    mkdirSync(folder(dir), { recursive: true });
    writeFileSync(
      join(folder(dir), `${id}.jsonl`),
      `${JSON.stringify({ type: 'user', cwd: dir })}\n`,
    );
  }
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  const pid = await orphanClaude(bin, repo);
  const inUse = spawn(join(bin, 'claude'), ['-e', 'setInterval(()=>{},1000)', '--', '-p'], {
    cwd: busy,
    stdio: 'ignore',
  });
  const f = fixture();
  for (const root of [repo, busy])
    f.control.execute(f.owner.actor, command('project.create', { name: root, root }));
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4503' });
  try {
    const call = (method: 'GET' | 'POST', url: string, token: string, body?: unknown) =>
      app.inject({
        method,
        url,
        headers: {
          host: '127.0.0.1:4503',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
      });
    const list = async () => {
      resetLocalSessionCache();
      return (await call('GET', '/api/local-sessions', f.owner.token)).json() as {
        sessions: {
          key: string;
          projectId: string | null;
          liveness: { state: string; startedAt: number };
        }[];
      };
    };
    expect(
      await untilAsync(async () => {
        const { sessions } = await list();
        return ['claude:orphaned-one', 'claude:busy-one'].every((key) =>
          sessions.some((s) => s.key === key && s.liveness.startedAt),
        );
      }),
    ).toBe(true);
    const listed = await list();
    const orphaned = listed.sessions.find((s) => s.key === 'claude:orphaned-one')!;
    const used = listed.sessions.find((s) => s.key === 'claude:busy-one')!;
    expect(orphaned.liveness.state).toBe('orphaned');
    expect(used.liveness.state).toBe('active');
    const stop = (key: string, token: string, startedAt: number) =>
      call('POST', `/api/local-sessions/${encodeURIComponent(key)}/stop`, token, { startedAt });
    expect((await stop(orphaned.key, f.sender.token, orphaned.liveness.startedAt)).statusCode).toBe(
      403,
    );
    const stale = await stop(orphaned.key, f.owner.token, orphaned.liveness.startedAt + 1000);
    expect(stale.statusCode).toBe(409);
    expect(JSON.stringify(stale.json())).toContain('PROCESS_CHANGED');
    const refused = await stop(used.key, f.owner.token, used.liveness.startedAt);
    expect(refused.statusCode).toBe(409);
    expect(JSON.stringify(refused.json())).toContain('SESSION_NOT_STALE');
    expect(alive(pid) && alive(inUse.pid!)).toBe(true);
    const done = await stop(orphaned.key, f.owner.token, orphaned.liveness.startedAt);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toEqual({ outcome: 'stopped' });
    expect(await until(() => !alive(pid))).toBe(true);
    expect(alive(inUse.pid!)).toBe(true);
    expect((await stop('claude:../../x', f.owner.token, 1)).statusCode).toBe(400);
  } finally {
    inUse.kill('SIGKILL');
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already stopped */
    }
    delete process.env['AETHER_LOCAL_SESSIONS_HOME'];
    resetLocalSessionCache();
    await app.close();
  }
}, 60000);
