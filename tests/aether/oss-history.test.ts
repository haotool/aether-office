import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  runReadiness,
  PERSON,
  scratch,
  git,
  MAINTAINER,
  NOREPLY,
  syntheticRepo,
} from './oss-tooling-env.js';

const loadHistory = () => import(pathToFileURL(resolve('scripts/oss/readiness-history.mjs')).href);
const loadTree = () => import(pathToFileURL(resolve('scripts/oss/readiness-tree.mjs')).href);
const loadResults = () => import(pathToFileURL(resolve('scripts/oss/readiness-results.mjs')).href);

describe('plans', () => {
  const repo = syntheticRepo('src-plan');
  const options = { maintainerEmails: [MAINTAINER.email], ref: 'main' };

  it('detects upstream commits, shortens subjects and is deterministic', () => {
    const b = buildPlan(repo, { ...options, strategy: 'B' });
    expect(JSON.stringify(buildPlan(repo, { ...options, strategy: 'B' }))).toBe(JSON.stringify(b));
    expect(b.upstream.commits).toBe(1);
    expect(b.summary.maintainerCommits).toBe(8);
    expect(b.messages.length).toBe(7);
    for (const m of b.messages) expect(m.subject.length).toBeLessThanOrEqual(72);
    const merge = b.messages.find((m: { from: string }) => m.from.startsWith('Merge'));
    expect(merge.subject).toBe('chore: merge side branch work');
  });

  it('squashes the maintainer chain into milestones that end on the original tip', () => {
    const c = buildPlan(repo, { ...options, strategy: 'C', target: 2 });
    expect(c.milestones[0].kind).toBe('upstream');
    expect(c.milestones.at(-1).tip).toBe(c.source.commit);
    expect(c.milestones.slice(1).every((m: { subject: string }) => m.subject.length <= 72)).toBe(
      true,
    );
    const covered = c.milestones.flatMap((m: { commits: string[] }) => m.commits);
    expect(new Set(covered).size).toBe(covered.length);
  });
});

describe('history-apply end to end', () => {
  const hasFilterRepo = spawnSync('git', ['filter-repo', '--version']).status === 0;

  it.skipIf(!hasFilterRepo)(
    'rewrites a throwaway clone, keeps the tip tree and never touches the source',
    () => {
      const source = syntheticRepo('src-apply');
      const sourceHead = git(source, ['rev-parse', 'HEAD']);
      const plan = buildPlan(source, {
        strategy: 'C',
        ref: 'main',
        target: 2,
        maintainerEmails: [MAINTAINER.email],
        canonicalEmail: NOREPLY,
      });
      const planFile = join(scratch, 'plan.json');
      writeFileSync(planFile, JSON.stringify(plan));
      const out = join(scratch, 'out-c');
      const apply = join(resolve('scripts/oss'), 'history-apply.sh');
      const env = { ...process.env, NODE: process.execPath };
      const dry = spawnSync(
        'bash',
        [apply, '--plan', planFile, '--out', out, '--source', source, '--dry-run'],
        { encoding: 'utf8', env },
      );
      expect(dry.status, dry.stderr).toBe(0);
      expect(existsSync(out)).toBe(false);
      const real = spawnSync(
        'bash',
        [apply, '--plan', planFile, '--out', out, '--source', source],
        { encoding: 'utf8', env },
      );
      expect(real.status, real.stdout + real.stderr).toBe(0);
      expect(git(source, ['rev-parse', 'HEAD'])).toBe(sourceHead);
      // the tip differs from the source only by the text rule that replaced the personal path in note.md
      expect(git(out, ['show', 'main:note.md'])).toBe('see /Users/dev/code');
      expect(git(out, ['rev-parse', 'main:src/f6.ts'])).toBe(
        git(source, ['rev-parse', 'main:src/f6.ts']),
      );
      expect(git(out, ['rev-list', '--count', 'main'])).toBe(
        String(plan.summary.expectedCommitsAfter),
      );
      expect(git(out, ['log', '--format=%an', '-1', 'main'])).toBe(MAINTAINER.name);
      expect(git(out, ['log', '--format=%ae %ce', '-1', 'main'])).toBe(`${NOREPLY} ${NOREPLY}`);
      const verify = spawnSync(
        process.execPath,
        [join(resolve('scripts/oss'), 'history-tools.mjs'), 'verify', out, planFile],
        { encoding: 'utf8' },
      );
      expect(verify.status, verify.stdout + verify.stderr).toBe(0);
      expect(verify.stdout).toContain('1/1 intact');
      expect(verify.stdout).toContain('1 rewritten by text rules');
      // a second apply into the same directory is refused
      const again = spawnSync(
        'bash',
        [apply, '--plan', planFile, '--out', out, '--source', source],
        { encoding: 'utf8', env },
      );
      expect(again.status).not.toBe(0);
      expect(readFileSync(join(out, 'oss', 'report.json'), 'utf8')).toContain('"strategy":"C"');
    },
    60000,
  );
});

describe('commit-msg.sh', () => {
  const script = resolve('scripts/oss/commit-msg.sh');
  const check = (subject: string) =>
    spawnSync('bash', [script, '--subject', subject], { encoding: 'utf8' }).status;

  it('accepts the convention and skips merges', () => {
    expect(check('feat(web): add a thing')).toBe(0);
    expect(check('fix!: break on purpose')).toBe(0);
    expect(check("Merge branch 'x' into y")).toBe(0);
  });

  it('rejects a missing type, a missing space and a subject over 72 characters', () => {
    expect(check('Added a thing')).toBe(1);
    expect(check('feat:no space')).toBe(1);
    expect(check(`feat: ${'x'.repeat(70)}`)).toBe(1);
    expect(check(`feat: ${'x'.repeat(66)}`)).toBe(0);
  });
});

describe('agent artifact hygiene', () => {
  it('flags tracked .omc paths as agent configuration', async () => {
    const { checkAgentArtifactsInTree } = await loadHistory();
    const { results } = await loadResults();
    results.length = 0;
    checkAgentArtifactsInTree(['src/a.ts', '.omc/state.json']);
    expect(results.find((r: { id: string }) => r.id === 'agent-artifacts')?.status).toBe('fail');
  });

  it('flags tracked .omc paths in tracked-artifacts hygiene', async () => {
    const { checkTrackedHygiene } = await loadTree();
    const { results } = await loadResults();
    results.length = 0;
    checkTrackedHygiene(process.cwd(), ['README.md', '.omc/config.toml']);
    const entry = results.find((r: { id: string }) => r.id === 'tracked-artifacts');
    expect(entry?.status).toBe('fail');
    expect(entry?.lines.some((line: string) => line.includes('.omc/'))).toBe(true);
  });
});

describe('large tracked files', () => {
  it('lets shipped assets pass the file limit inside their budget and warns about any other big file', async () => {
    const { largeTracked } = await loadTree();
    const { results } = await loadResults();
    const root = join(scratch, 'large');
    mkdirSync(join(root, 'apps/web/public/assets'), { recursive: true });
    writeFileSync(join(root, 'apps/web/public/assets/a.glb'), Buffer.alloc(1_500_000));
    writeFileSync(join(root, 'big.bin'), Buffer.alloc(1_500_000));
    const status = (files: string[]) => {
      results.length = 0;
      largeTracked(root, files, 1);
      return results.find((r: { id: string }) => r.id === 'large-tree')?.status;
    };
    expect(status(['apps/web/public/assets/a.glb'])).toBe('pass');
    expect(status(['apps/web/public/assets/a.glb', 'big.bin'])).toBe('warn');
  });
});

describe('readiness check', () => {
  it('fails on a personal path in the tree and passes on clean content', async () => {
    const repo = join(scratch, 'ready');
    mkdirSync(repo);
    git(repo, ['init', '-q', '-b', 'main']);
    writeFileSync(join(repo, 'a.md'), `see /Users/${PERSON}/code and /Users/dev/code\n`);
    writeFileSync(join(repo, 'b.ts'), 'export const x = 1;\n');
    git(repo, ['add', '-A']);
    git(repo, [
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.com',
      'commit',
      '-q',
      '-m',
      'chore: seed',
    ]);
    const base = {
      root: repo,
      history: false,
      privatePatterns: join(scratch, 'none'),
      maintainerEmails: [],
      maxHistoryMb: 5,
      skipGitleaks: true,
    };
    const results = await runReadiness(base);
    const status = (id: string) => results.find((r: { id: string }) => r.id === id)?.status;
    expect(status('tree-content')).toBe('fail');
    expect(status('community-files')).toBe('fail');
    writeFileSync(join(repo, 'a.md'), 'see /Users/dev/code\n');
    const clean = await runReadiness(base);
    expect(clean.find((r: { id: string }) => r.id === 'tree-content')?.status).toBe('pass');
  });

  it('flags a private pattern and tells nothing about the matched text', async () => {
    const repo = join(scratch, 'ready-private');
    mkdirSync(repo);
    git(repo, ['init', '-q', '-b', 'main']);
    writeFileSync(join(repo, 'a.md'), 'contact jane.doe\n');
    git(repo, ['add', '-A']);
    git(repo, [
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.com',
      'commit',
      '-q',
      '-m',
      'docs: seed',
    ]);
    const patterns = join(scratch, 'patterns');
    writeFileSync(patterns, 'jane.doe\n');
    const results = await runReadiness({
      root: repo,
      history: false,
      privatePatterns: patterns,
      maintainerEmails: [],
      maxHistoryMb: 5,
      skipGitleaks: true,
    });
    const content = results.find((r: { id: string }) => r.id === 'tree-content');
    expect(content.status).toBe('fail');
    expect(content.lines.join('\n')).not.toContain('jane.doe');
  });
});
