import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { gitKpiResponseSchema, usageResponseSchema } from '../../packages/contracts/src/index.js';
import { createServer } from '../../apps/control/src/server.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/local-sessions.js';
import { resetGitKpiCache } from '../../apps/control/src/services/git-kpi.js';
import { command, fixture } from './fixture.js';
import { claudeLine } from './usage-fixtures.js';

it('serves token and Git KPIs to a human owner only, validated, redacted and revalidated by ETag', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aether-usage-api-')));
  const repo = join(home, 'work', 'acme-site');
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  execFileSync('git', [
    '-C',
    repo,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'secret subject',
  ]);
  const folder = join(home, '.claude/projects', repo.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(folder, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(folder, 'kpi-session.jsonl'),
    [
      JSON.stringify({ type: 'user', cwd: repo }),
      claudeLine('msg_1', now, { i: 120, cw: 30, cr: 4000, o: 60 }, { tools: 2, cwd: repo }),
    ].join('\n') + '\n',
  );
  const before = process.env['AETHER_LOCAL_SESSIONS_HOME'];
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  resetLocalSessionCache();
  resetGitKpiCache();
  const f = fixture();
  f.control.execute(f.owner.actor, command('project.create', { name: 'Acme', root: repo }));
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4503' });
  const get = (url: string, token: string, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'GET',
      url,
      headers: { host: '127.0.0.1:4503', authorization: `Bearer ${token}`, ...headers },
    });
  try {
    expect((await get('/api/usage', f.sender.token)).statusCode).toBe(403); // an agent's credential
    expect((await get('/api/usage/git', f.sender.token)).statusCode).toBe(403);
    expect((await get('/api/usage?range=year', f.owner.token)).statusCode).toBe(400);

    let usage = await get('/api/usage?range=7d', f.owner.token);
    for (let n = 0; n < 20 && !usage.json().scan.complete; n++)
      usage = await get('/api/usage?range=7d', f.owner.token); // the first scan may still be reading
    expect(usage.statusCode).toBe(200);
    const body = usageResponseSchema.parse(usage.json());
    expect(body.enabled).toBe(true);
    expect(body.building.totals).toMatchObject({
      input: 120,
      cacheWrite: 30,
      cacheRead: 4000,
      output: 60,
      toolCalls: 2,
    });
    expect(body.projects[0]).toMatchObject({ repo: 'acme-site' });
    expect(body.cost).toBeNull();
    // numbers, model names and repository folder names only: nothing of the machine's paths or text
    expect(usage.body).not.toContain(home);
    expect(usage.body).not.toContain('secret subject');
    expect(usage.body).not.toContain('.jsonl');

    const tag = String(usage.headers['etag']);
    expect(tag).toMatch(/^W\//);
    const again = await get('/api/usage?range=7d', f.owner.token, { 'if-none-match': tag });
    expect(again.statusCode).toBe(304);

    const git = await get('/api/usage/git', f.owner.token);
    expect(git.statusCode).toBe(200);
    const kpi = gitKpiResponseSchema.parse(git.json());
    expect(kpi.projects[0]).toMatchObject({ repo: 'Acme' });
    expect(kpi.building?.commits.d30).toBe(1);
    expect(git.body).not.toContain('secret subject');
    expect(git.body).not.toContain(home);

    process.env['AETHER_LOCAL_SESSIONS'] = 'off';
    const off = (await get('/api/usage', f.owner.token)).json();
    expect(off.enabled).toBe(false);
    expect(off.building.totals.input).toBe(0);
    expect((await get('/api/usage/git', f.owner.token)).json()).toMatchObject({
      enabled: false,
      building: null,
    });
  } finally {
    delete process.env['AETHER_LOCAL_SESSIONS'];
    if (before === undefined) delete process.env['AETHER_LOCAL_SESSIONS_HOME'];
    else process.env['AETHER_LOCAL_SESSIONS_HOME'] = before;
    await app.close();
    f.control.close();
    rmSync(home, { recursive: true, force: true });
  }
});
