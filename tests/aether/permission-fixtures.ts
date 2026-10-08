import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../apps/control/src/server.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/runtime/local-sessions.js';
import { command, fixture } from './fixture.js';

/** A control plane with one project whose repository holds one Claude session, all under a temporary home. */
export function approvalsFixture(
  port: number,
  sessionId = 'sess-one',
  options: { lan?: boolean } = {},
) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aether-approvals-')));
  const repo = join(home, 'work', 'repo');
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['-C', repo, 'init', '-q']);
  execFileSync('git', [
    ...['-C', repo, '-c', 'user.email=a@b', '-c', 'user.name=x'],
    ...['commit', '-q', '--allow-empty', '-m', 'i'],
  ]);
  const folder = join(home, '.claude/projects', repo.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, `${sessionId}.jsonl`),
    `${JSON.stringify({ type: 'user', cwd: repo })}\n`,
  );
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  process.env['AETHER_APPROVALS_CONFIG'] = join(home, 'approvals.json');
  resetLocalSessionCache();
  const f = fixture();
  f.control.execute(f.owner.actor, command('project.create', { name: 'repo', root: repo }));
  const app = createServer(f.control, { origin: `http://127.0.0.1:${port}`, ...options });
  const host = `127.0.0.1:${port}`;
  const as = (token: string) => ({ host, authorization: `Bearer ${token}` });
  return {
    ...f,
    app,
    home,
    repo,
    host,
    as,
    configFile: join(home, 'approvals.json'),
    /** A browser session for a token: the cookie for reads, and the cookie plus CSRF for answers. */
    signIn: async (token: string) => {
      const login = await app.inject({
        method: 'POST',
        url: '/api/login',
        headers: { host },
        payload: { token },
      });
      const cookie = `${login.cookies[0]!.name}=${login.cookies[0]!.value}`;
      const csrf = (login.json() as { csrf: string }).csrf;
      return { read: { host, cookie }, write: { host, cookie, 'x-csrf-token': csrf } };
    },
    readConfig: () =>
      JSON.parse(readFileSync(join(home, 'approvals.json'), 'utf8')) as {
        url: string;
        token: string;
        verifyKey: string;
      },
    hookToken: () =>
      (JSON.parse(readFileSync(join(home, 'approvals.json'), 'utf8')) as { token: string }).token,
    enable: () =>
      app.inject({
        method: 'PUT',
        url: '/api/remote-approvals',
        headers: as(f.owner.token),
        payload: { enabled: true },
      }),
    sessionId,
  };
}
