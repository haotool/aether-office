import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { integrate, type MergeRequest } from '../../apps/runner/src/merge.js';

const run = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', cwd, ...args], {
    encoding: 'utf8',
  }).trim();

function repo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aether-merge-')));
  const repository = join(root, 'repo');
  mkdirSync(repository);
  run(repository, 'init', '-q', '-b', 'main');
  writeFileSync(join(repository, 'shared.txt'), 'base\n');
  run(repository, 'add', '.');
  run(repository, 'commit', '-qm', 'base');
  const base = run(repository, 'rev-parse', 'HEAD');
  const feature = (file: string, text: string) => {
    run(repository, 'checkout', '-q', '-b', `f-${file}`, base);
    writeFileSync(join(repository, file), text);
    run(repository, 'add', '.');
    run(repository, 'commit', '-qm', file);
    const sha = run(repository, 'rev-parse', 'HEAD');
    run(repository, 'checkout', '-q', 'main');
    return sha;
  };
  const scratch = join(root, 'scratch');
  mkdirSync(scratch);
  const hooks = join(root, 'hooks');
  mkdirSync(hooks);
  const request = (headSha: string, candidate: string, expectedBase = base): MergeRequest => ({
    repository,
    baseBranch: 'main',
    expectedBase,
    headSha,
    candidate,
    scratchDir: scratch,
    hooksDir: hooks,
    author: { name: 'AETHER', email: 'aether@localhost' },
  });
  return { repository, base, feature, request };
}

it('integrates into a candidate branch without moving base, touching the checkout, or leaving worktrees', async () => {
  const r = repo();
  const head = r.feature('new.txt', 'hello\n');
  const result = await integrate(r.request(head, 'aether/integrate/one'));
  expect(result.status).toBe('merged');
  if (result.status !== 'merged') return;
  expect(run(r.repository, 'rev-parse', 'main')).toBe(r.base);
  expect(run(r.repository, 'rev-parse', 'aether/integrate/one')).toBe(result.mergeSha);
  expect(run(r.repository, 'show', `${result.mergeSha}:new.txt`)).toBe('hello');
  expect(existsSync(join(r.repository, 'new.txt'))).toBe(false);
  expect(run(r.repository, 'worktree', 'list').split('\n')).toHaveLength(1);
  await expect(integrate(r.request(head, 'aether/integrate/one'))).rejects.toThrow(
    'MERGE_CANDIDATE_EXISTS',
  );
});

it('stops on conflict: reports files, creates nothing, never resolves automatically', async () => {
  const r = repo();
  const a = r.feature('shared.txt', 'from a\n');
  run(r.repository, 'checkout', '-q', 'main');
  writeFileSync(join(r.repository, 'shared.txt'), 'from main\n');
  run(r.repository, 'commit', '-qam', 'main change');
  const moved = run(r.repository, 'rev-parse', 'main');
  const result = await integrate(r.request(a, 'aether/integrate/conflict', moved));
  expect(result).toMatchObject({ status: 'conflict', files: ['shared.txt'] });
  expect(run(r.repository, 'branch', '--list', 'aether/integrate/conflict')).toBe('');
  expect(run(r.repository, 'worktree', 'list').split('\n')).toHaveLength(1);
  expect(readFileSync(join(r.repository, 'shared.txt'), 'utf8')).toBe('from main\n');
});

it('refuses when the base moved, and rejects unsafe refs and shas', async () => {
  const r = repo();
  const head = r.feature('x.txt', 'x\n');
  writeFileSync(join(r.repository, 'later.txt'), 'later\n');
  run(r.repository, 'add', '.');
  run(r.repository, 'commit', '-qm', 'later');
  expect(await integrate(r.request(head, 'aether/integrate/drift'))).toMatchObject({
    status: 'base_moved',
    expected: r.base,
  });
  await expect(integrate(r.request(head, '--delete'))).rejects.toThrow('MERGE_REF_INVALID');
  await expect(integrate(r.request(head, 'main2'))).rejects.toThrow('MERGE_CANDIDATE_NAMESPACE');
  await expect(integrate(r.request('HEAD', 'aether/integrate/y'))).rejects.toThrow(
    'MERGE_SHA_INVALID',
  );
});

it('reports up_to_date when the commit is already in base', async () => {
  const r = repo();
  expect(await integrate(r.request(r.base, 'aether/integrate/noop'))).toEqual({
    status: 'up_to_date',
    baseSha: r.base,
    headSha: r.base,
  });
  expect(run(r.repository, 'branch', '--list', 'aether/integrate/noop')).toBe('');
});

it('serialises integrations of the same repository', async () => {
  const r = repo();
  const a = r.feature('a.txt', 'a\n');
  const b = r.feature('b.txt', 'b\n');
  const results = await Promise.all([
    integrate(r.request(a, 'aether/integrate/a')),
    integrate(r.request(b, 'aether/integrate/b')),
  ]);
  expect(results.map((x) => x.status)).toEqual(['merged', 'merged']);
  expect(run(r.repository, 'worktree', 'list').split('\n')).toHaveLength(1);
});
