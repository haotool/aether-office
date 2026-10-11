import { expect, it } from 'vitest';
import { layoutGraph, parseLog } from '../../apps/control/src/services/git/git-graph.js';

it('lays a branch and its merge out in two lanes, like git log --graph', () => {
  const { commits, lanes } = layoutGraph([
    {
      sha: 'm3',
      parents: ['m2', 'f2'],
      refs: ['HEAD -> main'],
      subject: 'merge',
      author: 'a',
      at: 5,
    },
    { sha: 'f2', parents: ['f1'], refs: [], subject: 'f2', author: 'a', at: 4 },
    { sha: 'm2', parents: ['m1'], refs: [], subject: 'm2', author: 'a', at: 3 },
    { sha: 'f1', parents: ['m1'], refs: [], subject: 'f1', author: 'a', at: 2 },
    { sha: 'm1', parents: [], refs: [], subject: 'root', author: 'a', at: 1 },
  ]);
  expect(lanes).toBe(2);
  expect(commits.map((c) => [c.sha, c.lane])).toEqual([
    ['m3', 0],
    ['f2', 1],
    ['m2', 0],
    ['f1', 1],
    ['m1', 0],
  ]);
  expect(commits[0]!.edges).toEqual([
    { to: 0, parent: 'm2' },
    { to: 1, parent: 'f2' },
  ]);
});

it('parses log lines and redacts secrets in subjects', () => {
  const [c] = parseLog(
    'abc\x1fp1 p2\x1fHEAD -> main, origin/main\x1fadd key ghp_abcdefghijklmnopqrstuvwxyz0123\x1f100\x1fAda\n',
  );
  expect(c).toMatchObject({
    sha: 'abc',
    parents: ['p1', 'p2'],
    refs: ['HEAD -> main', 'origin/main'],
    at: 100000,
    author: 'Ada',
  });
  expect(c!.subject).not.toContain('ghp_');
});
