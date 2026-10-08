import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/runtime/local-sessions.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t.test', ...args], {
    stdio: 'ignore',
  });

it('counts the files a real merge left conflicted, from the status read the scan already makes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-conflict-'));
  const repo = join(home, 'proj');
  await mkdir(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  await writeFile(join(repo, 'a.txt'), 'base\n');
  await writeFile(join(repo, 'b.txt'), 'base\n');
  await writeFile(join(repo, 'c.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'checkout', '-q', '-b', 'feature');
  await writeFile(join(repo, 'a.txt'), 'feature\n');
  await writeFile(join(repo, 'b.txt'), 'feature\n');
  git(repo, 'commit', '-q', '-am', 'feature');
  git(repo, 'checkout', '-q', 'main');
  await writeFile(join(repo, 'a.txt'), 'main\n');
  await writeFile(join(repo, 'b.txt'), 'main\n');
  git(repo, 'commit', '-q', '-am', 'main');

  const dir = join(home, '.claude/projects/-proj');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 's1.jsonl'),
    `${JSON.stringify({ type: 'user', cwd: repo, message: { role: 'user', content: 'x' } })}\n`,
  );
  resetLocalSessionCache();
  const clean = (await scanLocalSessions(home, Date.now(), 0, join(home, 'none')))[0]!;
  expect(clean.git).toMatchObject({ branch: 'main', conflicts: 0 });

  expect(() => git(repo, 'merge', 'feature')).toThrow(); // two files conflict
  await writeFile(join(repo, 'untracked.txt'), 'x');
  resetLocalSessionCache();
  const merging = (await scanLocalSessions(home, Date.now(), 0, join(home, 'none')))[0]!;
  expect(merging.git).toMatchObject({ conflicts: 2, uncommitted: 3 });
});
