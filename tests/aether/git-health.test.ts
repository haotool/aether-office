import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import {
  cleanMergedWorktrees,
  gitHealth,
  worktreeSizes,
  parseWorktrees,
} from '../../apps/control/src/services/git-health.js';
import { command, fixture } from './fixture.js';

it('parses worktree porcelain, marking the main, locked and prunable entries', () => {
  const list = parseWorktrees(
    'worktree /r\nHEAD aaa\nbranch refs/heads/main\n\nworktree /r-feat\nHEAD bbb\nbranch refs/heads/feat\nlocked\n\nworktree /gone\nHEAD ccc\ndetached\nprunable gitdir file points to non-existent location\n',
  );
  expect(list.map((w) => [w.path, w.branch, w.main, w.locked, w.prunable])).toEqual([
    ['/r', 'main', true, false, false],
    ['/r-feat', 'feat', false, true, false],
    ['/gone', null, false, false, true],
  ]);
});

it('reports merged worktrees and branches, missing worktrees and sizes, and suggests without removing anything', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aether-git-health-')));
  const repo = join(dir, 'repo');
  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      encoding: 'utf8',
    });
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    g(repo, 'add', '.');
    g(repo, 'commit', '-qm', 'base');
    g(repo, 'worktree', 'add', '-q', '-b', 'done', join(dir, 'wt-done'));
    writeFileSync(join(dir, 'wt-done', 'b.txt'), 'b\n');
    g(join(dir, 'wt-done'), 'add', '.');
    g(join(dir, 'wt-done'), 'commit', '-qm', 'done work');
    g(repo, 'merge', '-q', 'done');
    g(repo, 'worktree', 'add', '-q', '-b', 'wip', join(dir, 'wt-wip'));
    writeFileSync(join(dir, 'wt-wip', 'c.txt'), 'c\n'); // unmerged and dirty
    g(repo, 'worktree', 'add', '-q', '-b', 'lost', join(dir, 'wt-lost'));
    rmSync(join(dir, 'wt-lost'), { recursive: true }); // deleted without `git worktree remove`
    g(repo, 'branch', 'old-merged');
    const report = await gitHealth(repo);
    const by = Object.fromEntries(report.worktrees.map((w) => [w.branch ?? w.path, w]));
    expect(report.defaultBranch).toBe('main');
    expect(by['done']).toMatchObject({ merged: true, dirty: 0 });
    expect(by['wip']).toMatchObject({ merged: false, dirty: null }); // changes are only counted where removal is possible
    expect(by['wip']!.lastCommitAt).toBeGreaterThan(0);
    expect(by['lost']).toMatchObject({ prunable: true });
    expect(report.staleBranches).toEqual(['old-merged']);
    expect(report.suggestions).toEqual([
      'git worktree prune',
      `git worktree remove ${JSON.stringify(join(dir, 'wt-done'))}`,
      'git branch -d old-merged',
    ]);
    expect(report.removable).toEqual([join(dir, 'wt-done')]);
    // The sizes come apart from the report: every worktree still on disk, none for the one that is gone.
    const { sizes } = await worktreeSizes(repo);
    expect(sizes[repo]).toBeGreaterThan(0);
    expect(sizes[join(dir, 'wt-done')]).toBeGreaterThan(0);
    expect(Object.keys(sizes)).not.toContain(join(dir, 'wt-lost'));
    // Nothing was removed.
    expect(g(repo, 'worktree', 'list')).toContain('wt-done');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('cleans only merged, clean, unused worktrees, re-checking each and never forcing', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aether-git-clean-')));
  const repo = join(dir, 'repo');
  const g = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      encoding: 'utf8',
    });
  const merge = (name: string) => {
    g(repo, 'worktree', 'add', '-q', '-b', name, join(dir, name));
    writeFileSync(join(dir, name, `${name}.txt`), name);
    g(join(dir, name), 'add', '.');
    g(join(dir, name), 'commit', '-qm', name);
    g(repo, 'merge', '-q', '--no-edit', name);
  };
  try {
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    g(repo, 'add', '.');
    g(repo, 'commit', '-qm', 'base');
    merge('clean');
    merge('dirty');
    writeFileSync(join(dir, 'dirty', 'scratch.txt'), 'not committed'); // untracked file: must survive
    merge('busy');
    g(repo, 'worktree', 'add', '-q', '-b', 'open', join(dir, 'open'));
    writeFileSync(join(dir, 'open', 'o.txt'), 'o');
    g(join(dir, 'open'), 'add', '.');
    g(join(dir, 'open'), 'commit', '-qm', 'unmerged work');
    const results = await cleanMergedWorktrees(
      repo,
      [
        join(dir, 'clean'),
        join(dir, 'dirty'),
        join(dir, 'busy'),
        join(dir, 'open'),
        repo,
        '/nowhere',
      ],
      [join(dir, 'busy', 'src')], // a live agent is working inside it
    );
    expect(Object.fromEntries(results.map((r) => [r.path, r.reason ?? r.outcome]))).toEqual({
      [join(dir, 'clean')]: 'removed',
      [join(dir, 'dirty')]: 'has uncommitted changes',
      [join(dir, 'busy')]: 'an agent is working in it',
      [join(dir, 'open')]: 'not merged into the default branch',
      [repo]: 'the main worktree',
      '/nowhere': 'not a worktree of this repository',
    });
    expect(existsSync(join(dir, 'clean'))).toBe(false);
    expect(existsSync(join(dir, 'dirty', 'scratch.txt'))).toBe(true);
    expect(g(repo, 'branch', '--list', 'clean')).toContain('clean'); // branches are never deleted
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('lets only an owner run the clean-up, and records what it did', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aether-git-clean-api-')));
  execFileSync('git', ['init', '-q', '-b', 'main', join(dir, 'repo')]);
  execFileSync('git', [
    '-C',
    join(dir, 'repo'),
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'base',
  ]);
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4503' });
  try {
    const projectId = String(
      f.control.execute(
        f.owner.actor,
        command('project.create', { name: 'Repo', root: join(dir, 'repo') }),
      ).result['id'],
    );
    const post = (token: string) =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/git-health/clean`,
        headers: {
          host: '127.0.0.1:4503',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: { paths: [join(dir, 'nope')] },
      });
    expect((await post(f.sender.token)).statusCode).toBe(403);
    const ok = await post(f.owner.token);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().results).toEqual([
      { path: join(dir, 'nope'), outcome: 'skipped', reason: 'not a worktree of this repository' },
    ]);
    expect(
      f.control
        .events(f.owner.actor, projectId, '0', 50)
        .some((e) => e.type === 'git.worktrees.cleaned'),
    ).toBe(true);
  } finally {
    await app.close();
    f.control.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
