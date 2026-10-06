import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  buildKpi,
  gitKpi,
  parseBranches,
  parseShortstat,
  resetGitKpiCache,
  sumKpis,
} from '../../apps/control/src/services/git-kpi.js';
import { windowDays } from '../../apps/control/src/services/usage-aggregate.js';
import { dayKeyOf } from '../../apps/control/src/services/usage-parse.js';

const dayOf = dayKeyOf('UTC');
const DAY = 86_400_000;
let dir: string;
let repo: string;
beforeEach(() => {
  resetGitKpiCache();
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'aether-git-kpi-')));
  repo = join(dir, 'repo');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs git in the repository as `author`, with every commit made `daysAgo` days ago. */
function git(args: string[], author = 'ann', daysAgo = 0) {
  const when = new Date(Date.now() - daysAgo * DAY).toISOString();
  execFileSync(
    'git',
    ['-C', repo, '-c', `user.name=${author}`, '-c', `user.email=${author}@t`, ...args],
    {
      env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
      encoding: 'utf8',
    },
  );
}
const commit = (file: string, author = 'ann', daysAgo = 0) => {
  writeFileSync(join(repo, file), `${file}\nline two\n`);
  git(['add', '.'], author, daysAgo);
  git(['commit', '-qm', `add ${file}`], author, daysAgo);
};

it('counts commits, merge commits, merged and open branches, authors, lines and the oldest open branch', async () => {
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  commit('base.txt', 'ann', 60); // outside the window
  git(['checkout', '-qb', 'done']);
  commit('done.txt', 'bob', 3);
  git(['checkout', '-q', 'main']);
  git(['merge', '--no-ff', '-qm', 'merge done', 'done'], 'ann', 2); // a merge commit
  git(['checkout', '-qb', 'fast']);
  commit('fast.txt', 'ann', 1);
  git(['checkout', '-q', 'main']);
  git(['merge', '--ff-only', '-q', 'fast']); // fast-forwarded: no merge commit
  git(['branch', 'fresh']); // created on the tip, no work of its own
  git(['checkout', '-qb', 'wip']);
  commit('wip.txt', 'cy', 10);
  commit('wip2.txt', 'cy', 0);
  git(['checkout', '-q', 'main']);

  const days = windowDays(dayOf(Date.now()));
  const kpi = (await gitKpi(repo, days, dayOf))!;
  // in the window: done (3d), the merge (2d), fast (1d), wip (10d) and wip2 (today); the 60-day-old base is outside
  expect(kpi.commits).toEqual({ today: 1, d7: 4, d30: 5 });
  expect(kpi.merges.d30).toBe(1);
  expect(kpi.mergedBranches.d30).toBe(2); // done (merge commit) and fast (fast-forward)
  expect(kpi.mergedBranches.d7).toBe(2);
  expect(kpi.openBranches).toBe(1); // wip; "fresh" is a branch with no work, not an open one
  expect(kpi.authors30).toBe(3); // ann, bob, cy
  expect(kpi.longestOpenDays).toBe(10);
  expect(kpi.added30).toBeGreaterThan(0);
  expect(kpi.daily).toHaveLength(30);
  expect(kpi.daily.reduce((a, b) => a + b, 0)).toBe(kpi.commits.d30);
});

it('is null for something that is not a repository or has no commit, and caches by branch tips', async () => {
  const days = windowDays(dayOf(Date.now()));
  expect(await gitKpi(dir, days, dayOf)).toBeNull();
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  expect(await gitKpi(repo, days, dayOf)).toBeNull(); // no commit yet
  commit('a.txt');
  const first = await gitKpi(repo, days, dayOf, Date.now());
  commit('b.txt');
  expect(await gitKpi(repo, days, dayOf, Date.now() + 1000)).toBe(first); // inside the minute: remembered
  const later = (await gitKpi(repo, days, dayOf, Date.now() + 120_000))!;
  expect(later.commits.today).toBe(first!.commits.today + 1); // tips changed: read again
});

it('parses what git prints, and sums repositories', () => {
  expect(parseBranches('main\tabc\t1700000000\nbad\n')).toEqual([
    { name: 'main', sha: 'abc', at: 1_700_000_000_000 },
  ]);
  expect(
    parseShortstat(
      ' 2 files changed, 10 insertions(+), 3 deletions(-)\n\n 1 file changed, 1 insertion(+)\n',
    ),
  ).toEqual({ added: 11, removed: 3 });
  const one = buildKpi(
    {
      base: 'main',
      branches: [],
      merged: new Set(),
      commits: [],
      baseMerges: [],
      lines: null,
      worked: new Set(),
      openSince: [],
    },
    ['2026-10-06', '2026-10-07'],
    dayOf,
    Date.parse('2026-10-07T12:00:00Z'),
  );
  expect(one).toMatchObject({
    openBranches: 0,
    added30: null,
    longestOpenDays: null,
    daily: [0, 0],
  });
  expect(sumKpis([])).toBeNull();
  const two = sumKpis([
    { ...one, openBranches: 2, longestOpenDays: 4 },
    { ...one, openBranches: 1, longestOpenDays: 9 },
  ])!;
  expect(two).toMatchObject({ openBranches: 3, longestOpenDays: 9, added30: null });
});
