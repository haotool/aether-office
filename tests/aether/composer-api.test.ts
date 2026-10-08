import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { readProcessTable } from '../../apps/control/src/services/runtime/agent-processes.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/runtime/local-sessions.js';
import { completePaths } from '../../apps/control/src/services/sessions/session-files.js';
import {
  parseIdentity,
  terminalOfProcess,
} from '../../apps/control/src/services/terminals/terminal-link.js';
import { processIdentity } from '../../packages/providers/src/index.js';
import { command, fixture } from './fixture.js';
import { sleep, until } from './process-fixtures.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=a@b', '-c', 'user.name=x', ...args]);

function world() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aether-composer-')));
  const repo = join(home, 'work', 'app');
  mkdirSync(join(repo, 'src'), { recursive: true });
  git(repo, 'init', '-q');
  writeFileSync(join(repo, '.gitignore'), 'dist/\n');
  writeFileSync(join(repo, 'src', 'upload.ts'), 'x');
  writeFileSync(join(repo, 'README.md'), 'x');
  writeFileSync(join(repo, '.env'), 'TOKEN=abc');
  mkdirSync(join(repo, 'dist'));
  writeFileSync(join(repo, 'dist', 'bundle.js'), 'x');
  git(repo, 'add', '.gitignore', 'src', 'README.md');
  git(repo, 'commit', '-q', '-m', 'i');
  writeFileSync(join(repo, 'src', 'untracked.ts'), 'x'); // not tracked, not ignored: offered
  for (const [provider, id] of [
    ['claude', 'claude-one'],
    ['codex', '019aaaaa-0000-4000-8000-000000000001'],
  ] as const) {
    const folder =
      provider === 'claude'
        ? join(home, '.claude/projects', repo.replace(/[^A-Za-z0-9]/g, '-'))
        : join(home, '.codex/sessions/2026/10/06');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(
        folder,
        provider === 'claude' ? `${id}.jsonl` : `rollout-2026-10-06T10-00-00-${id}.jsonl`,
      ),
      provider === 'claude'
        ? `${JSON.stringify({ type: 'user', cwd: repo })}\n`
        : `${JSON.stringify({ type: 'session_meta', payload: { id, cwd: repo } })}\n`,
    );
  }
  return { home, repo };
}

it('lists a session custom commands and skills: names and short redacted descriptions, bounded, no links followed', async () => {
  const { home, repo } = world();
  const commands = join(repo, '.claude/commands');
  mkdirSync(join(commands, 'team'), { recursive: true });
  writeFileSync(
    join(commands, 'review-pr.md'),
    '---\ndescription: "Review the open PR, token=abc123secret"\n---\nbody',
  );
  writeFileSync(join(commands, 'team', 'ship.md'), '# Ship it\nmore');
  writeFileSync(join(home, 'outside.md'), 'secret outside the folders');
  symlinkSync(join(home, 'outside.md'), join(commands, 'linked.md'));
  mkdirSync(join(repo, '.claude/skills/deploy'), { recursive: true });
  writeFileSync(
    join(repo, '.claude/skills/deploy/SKILL.md'),
    '---\nname: deploy\ndescription: Deploy the app\n---',
  );
  mkdirSync(join(home, '.claude/commands'), { recursive: true });
  writeFileSync(join(home, '.claude/commands/mine.md'), 'My own command');
  for (let i = 0; i < 250; i++)
    writeFileSync(join(home, '.claude/commands', `bulk-${i}.md`), `Bulk ${i}`);
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  resetLocalSessionCache();
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4531' });
  const get = (url: string, token = f.owner.token) =>
    app.inject({
      method: 'GET',
      url,
      headers: { host: '127.0.0.1:4531', authorization: `Bearer ${token}` },
    });
  try {
    const res = await get('/api/local-sessions/claude:claude-one/commands');
    const { commands: list } = res.json() as {
      commands: { name: string; description: string; source: string; kind: string }[];
    };
    expect(list.length).toBeLessThanOrEqual(200);
    const byName = new Map(list.map((c) => [c.name, c]));
    expect(byName.get('review-pr')).toMatchObject({ source: 'project', kind: 'command' });
    expect(byName.get('review-pr')!.description).not.toContain('abc123secret');
    expect(byName.get('review-pr')!.description).toContain('Review the open PR');
    expect(byName.get('team:ship')?.description).toBe('Ship it');
    expect(byName.get('deploy')).toMatchObject({ kind: 'skill', description: 'Deploy the app' });
    expect(byName.has('linked')).toBe(false);
    expect(JSON.stringify(list)).not.toContain('secret outside');
    expect(
      (await get('/api/local-sessions/codex:019aaaaa-0000-4000-8000-000000000001/commands')).json(),
    ).toEqual({
      commands: [],
    });
    expect((await get('/api/local-sessions/claude:..%2F..%2Fetc/commands')).statusCode).toBe(400);
    expect((await get('/api/local-sessions/claude:missing-one/commands')).statusCode).toBe(404);
    const viewer = f.control.createIdentity(f.owner.actor, {
      name: 'Viewer',
      role: 'viewer',
      projectIds: ['*'],
    });
    expect(
      (await get('/api/local-sessions/claude:claude-one/commands', viewer.token)).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/local-sessions/claude:claude-one/commands',
          headers: { host: '127.0.0.1:4531' },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await app.close();
    f.control.close();
  }
});

it('completes @ paths from what Git knows: ignored and credential files left out, bounded, a query is only a filter', async () => {
  const { home, repo } = world();
  for (let i = 0; i < 40; i++) writeFileSync(join(repo, 'src', `part-${i}.ts`), 'x');
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  resetLocalSessionCache();
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4532' });
  const files = async (q: string) =>
    (
      (
        await app.inject({
          method: 'GET',
          url: `/api/local-sessions/claude:claude-one/files?q=${encodeURIComponent(q)}`,
          headers: { host: '127.0.0.1:4532', authorization: `Bearer ${f.owner.token}` },
        })
      ).json() as { files?: string[] }
    ).files ?? null;
  try {
    const all = (await files(''))!;
    expect(all).toHaveLength(20);
    expect(await files('upload')).toEqual(['src/upload.ts']);
    expect(await files('untracked')).toEqual(['src/untracked.ts']);
    expect(await files('bundle')).toEqual([]); // ignored
    expect(await files('.env')).toEqual([]); // credentials
    expect(await files('../../../etc/passwd')).toEqual([]);
    expect(await files('/etc/passwd')).toEqual([]);
    expect(await files('x'.repeat(101))).toBeNull(); // over the query bound: refused
  } finally {
    await app.close();
    f.control.close();
  }
});

it('never offers a path that leaves the directory', () => {
  const paths = [
    'a.ts',
    '../b.ts',
    'x/../../c.ts',
    '/etc/passwd',
    'dir/.env.local',
    'k/id_rsa',
    'ok/d.ts',
  ];
  expect(completePaths(paths, '', 20)).toEqual(['a.ts', 'ok/d.ts']);
});

it('finds the AETHER terminal behind a process by pid and start time, through its parents', async () => {
  expect(parseIdentity('123:Mon Oct  5 10:23:45 2026')).toMatchObject({ pid: 123 });
  expect(parseIdentity('garbage')).toBeNull();
  expect(parseIdentity('x:Mon Oct  5 10:23:45 2026')).toBeNull();
  // A shell (the terminal's child) with a program under it (the agent).
  const shell = spawn('sh', ['-c', 'sleep 30; :'], { stdio: 'ignore' });
  try {
    const identity = processIdentity(shell);
    let table = await readProcessTable();
    await until(() => false, 300);
    table = await readProcessTable();
    const agent = table.find((r) => r.ppid === shell.pid);
    expect(agent).toBeTruthy();
    const terminals = [{ id: 'terminal-1', identity }];
    expect(terminalOfProcess(table, agent!.pid, terminals)).toBe('terminal-1');
    expect(terminalOfProcess(table, shell.pid!, terminals)).toBe('terminal-1');
    // The same pid with another start time is a reused pid, not the terminal.
    const reused = [{ id: 'terminal-1', identity: `${shell.pid}:Mon Jan  1 00:00:00 2001` }];
    expect(terminalOfProcess(table, agent!.pid, reused)).toBeNull();
    expect(terminalOfProcess(table, process.pid, terminals)).toBeNull();
  } finally {
    shell.kill('SIGKILL');
    await sleep(50);
  }
});

it('answers no terminal for a session AETHER did not start', async () => {
  const { home } = world();
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  resetLocalSessionCache();
  const f = fixture();
  f.control.execute(
    f.owner.actor,
    command('project.create', { name: 'app', root: join(home, 'work', 'app') }),
  );
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4533' });
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/api/local-sessions/claude:claude-one/terminal',
      headers: { host: '127.0.0.1:4533', authorization: `Bearer ${f.owner.token}` },
    });
    expect(res.json()).toEqual({ terminal: null });
  } finally {
    await app.close();
    f.control.close();
  }
});
