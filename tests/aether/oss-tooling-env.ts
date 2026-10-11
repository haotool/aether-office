import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll } from 'vitest';

const load = (name: string) => import(pathToFileURL(resolve('scripts/oss', name)).href);
export const lib = await load('lib.mjs');
export const { buildPlan } = await load('history-plan.mjs');
export const { run: runReadiness } = await load('readiness-check.mjs');

export const PERSON = ['jd', 'oe'].join('');

export const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'aether-oss-')));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

export const git = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).trim();

export type Who = { name: string; email: string };
export const MAINTAINER: Who = { name: 'Maint Ainer', email: 'maint@example.com' };
export const NOREPLY = '1+maint@users.noreply.example.com';
export const UPSTREAM: Who = { name: 'Up Stream', email: 'up@example.org' };

function commit(
  repo: string,
  who: Who,
  message: string,
  files: Record<string, string>,
  day: string,
) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(repo, name, '..'), { recursive: true });
    writeFileSync(join(repo, name), content);
  }
  git(repo, ['add', '-A']);
  const date = `${day}T12:00:00+0000`;
  git(repo, ['commit', '-q', '-m', message], {
    GIT_AUTHOR_NAME: who.name,
    GIT_AUTHOR_EMAIL: who.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: who.name,
    GIT_COMMITTER_EMAIL: who.email,
    GIT_COMMITTER_DATE: date,
  });
}

export function syntheticRepo(name: string) {
  const repo = join(scratch, name);
  mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  commit(
    repo,
    UPSTREAM,
    [
      'Initial upstream snapshot (#1)',
      'Claude-Session: https://claude.example/code/session_1\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>\nCo-authored-by: Real Person <real@example.com>',
    ].join('\n\n'),
    { 'README.md': '# up\n', 'big.glb': 'v1' },
    '2026-01-01',
  );
  for (let i = 1; i <= 6; i++) {
    const long = `feat(web): add feature number ${i} with a deliberately long description: the second clause explains more and more`;
    commit(
      repo,
      MAINTAINER,
      long,
      { [`src/f${i}.ts`]: `export const f${i} = ${i};\n`, 'big.glb': `v${i + 1}` },
      `2026-01-0${i + 1}`,
    );
    if (i === 3) {
      git(repo, ['checkout', '-q', '-b', 'side']);
      commit(
        repo,
        MAINTAINER,
        'fix: side branch work',
        { 'src/side.ts': 'export const s = 1;\n', 'note.md': `see /Users/${PERSON}/code\n` },
        '2026-01-04',
      );
      git(repo, ['checkout', '-q', 'main']);
      git(repo, ['merge', '-q', '--no-ff', '-m', "Merge branch 'side' into main", 'side'], {
        GIT_AUTHOR_NAME: MAINTAINER.name,
        GIT_AUTHOR_EMAIL: MAINTAINER.email,
        GIT_COMMITTER_NAME: MAINTAINER.name,
        GIT_COMMITTER_EMAIL: MAINTAINER.email,
      });
    }
  }
  return repo;
}
