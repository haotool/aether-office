import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// The release kit is plain .mjs; import it untyped.
const load = (name: string) => import(pathToFileURL(resolve('scripts/oss', name)).href);
const lib = await load('lib.mjs');
const { buildPlan } = await load('history-plan.mjs');
const { run: runReadiness } = await load('readiness-check.mjs');

// Built at runtime: the history cleanup rewrites home directories in every file, including these fixtures.
const PERSON = ['jd', 'oe'].join('');

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'aether-oss-')));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).trim();

type Who = { name: string; email: string };
const MAINTAINER: Who = { name: 'Maint Ainer', email: 'maint@example.com' };
const NOREPLY = '1+maint@users.noreply.example.com';
const UPSTREAM: Who = { name: 'Up Stream', email: 'up@example.org' };

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

/** An upstream root, a maintainer chain with long subjects, and a side branch merged back. */
function syntheticRepo(name: string) {
  const repo = join(scratch, name);
  mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  commit(
    repo,
    UPSTREAM,
    'Initial upstream snapshot (#1)',
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

describe('pattern matching', () => {
  const rules = lib.BUILT_IN_RULES;

  it('flags personal home directories and ignores placeholders', () => {
    const text = [
      `/Users/${PERSON}/code`,
      `C:\\\\Users\\\\${PERSON}\\\\x`,
      `/home/${PERSON}/x`,
      '/Users/dev/ok',
      '/Users/sam/ok',
      '/home/runner/work',
    ].join('\n');
    const found = lib.scanText(text, rules).map((f: { line: number }) => f.line);
    expect(found).toEqual([1, 2, 3]);
  });

  it('keeps LAN addresses and local host names to documentation only', () => {
    expect(lib.scanText('ip 192.168.1.20 at office.lan', rules)).toEqual([]);
    const docs = lib.scanText('ip 192.168.1.20 at office.lan', rules, { docs: true });
    expect(docs.map((f: { rule: string }) => f.rule).sort()).toEqual(['hostname', 'lan-address']);
  });

  it('flags machine host names and redacts token samples', () => {
    expect(lib.scanText("on Jane's-MacBook-Pro", rules)).toHaveLength(1);
    const fakeToken = `ghp_${'a1B2'.repeat(10)}`;
    const [hit] = lib.scanText(`token=${fakeToken}`, lib.TOKEN_RULES);
    expect(hit.sample).not.toContain(fakeToken);
    expect(hit.sample.startsWith('ghp_')).toBe(true);
  });

  it('parses private patterns, hides the matched text and builds replacement rules', () => {
    const parsed = lib.parsePrivatePatterns(
      '# c\njane.doe ==> dev\nre:jane[._-]?doe@\\S+ ==> user@example.com\n\n',
    );
    expect(parsed.map((p: { replacement: string }) => p.replacement)).toEqual([
      'dev',
      'user@example.com',
    ]);
    const [hit] = lib.scanText('written by JANE.DOE', parsed);
    expect(hit.sample).toBe('(private pattern)');
    const rules = lib.replaceRules(parsed);
    expect(rules).toHaveLength(4);
    const home = new RegExp(rules[0].re, 'g');
    expect(`/Users/${PERSON}/a /Users/a/b`.replace(home, rules[0].rep)).toBe(
      '/Users/dev/a /Users/a/b',
    );
  });
});

describe('subjects', () => {
  it('leaves short subjects alone and shortens long ones at a clause boundary', () => {
    expect(lib.shortenSubject('fix: small')).toBe('fix: small');
    const long =
      'feat(web): opt-in LAN access (AETHER_HOST) for phones and tablets: private-network Host/Origin allow-list that still refuses public names';
    const short = lib.shortenSubject(long);
    expect(short).toBe('feat(web): opt-in LAN access (AETHER_HOST) for phones and tablets');
    expect(short.length).toBeLessThanOrEqual(72);
  });

  it('never ends on a dangling word or an open parenthesis', () => {
    const short = lib.shortenSubject(
      'fix: restore the original dependency-policy tests that the previous commit overwrote and add checks',
    );
    expect(short.length).toBeLessThanOrEqual(72);
    expect(short).not.toMatch(/\s(?:the|and|that|a|of)$/);
    const paren = lib.shortenSubject(
      `feat: ${'word '.repeat(10)}(an aside that runs on and on and on and on and on)`,
    );
    expect(paren.length).toBeLessThanOrEqual(72);
    expect((paren.match(/\(/g) ?? []).length).toBe((paren.match(/\)/g) ?? []).length);
  });

  it('keeps the full original subject in the body and names merges after their topic', () => {
    const message = lib.rewriteMessage(
      'feat: short',
      'feat: short and then a very long tail that was cut\n\nbody text',
    );
    expect(message).toBe(
      'feat: short\n\nfeat: short and then a very long tail that was cut\n\nbody text\n',
    );
    expect(lib.mergeSubject('feat(web): schedules section in settings')).toBe(
      'chore: merge schedules section in settings',
    );
    expect(lib.stripTrailers('feat: x\n\nbody\n\nCo-Authored-By: Someone <s@example.com>\n')).toBe(
      'feat: x\n\nbody\n',
    );
  });
});

describe('milestone grouping', () => {
  const unit = (i: number, subject: string, day: string, pinned = false) => ({
    pinned,
    type: 'feat',
    scope: '',
    subject,
    day,
    index: i,
  });
  const units = Array.from({ length: 60 }, (_, i) =>
    unit(
      i,
      i < 20 ? 'phone layout' : i < 40 ? 'camera for the 3d scene' : 'approval hardening',
      `2026-01-${String(1 + Math.floor(i / 10)).padStart(2, '0')}`,
      i === 30,
    ),
  );

  it('is deterministic, ordered, complete and never merges a pinned unit', () => {
    const first = lib.groupUnits(units, { target: 6 });
    expect(JSON.stringify(lib.groupUnits(units, { target: 6 }))).toBe(JSON.stringify(first));
    expect(first.flatMap((g: { indexes: number[] }) => g.indexes)).toEqual(units.map((_, i) => i));
    const pinned = first.find((g: { pinned: boolean }) => g.pinned);
    expect(pinned.indexes).toEqual([30]);
    expect(first.length).toBeGreaterThanOrEqual(5);
    expect(first.length).toBeLessThanOrEqual(8);
  });

  it('cuts where the theme changes', () => {
    const groups = lib.groupUnits(
      units.filter((u) => !u.pinned),
      { target: 3 },
    );
    const themes = groups.map((g: { themes: { id: string }[] }) => g.themes[0]?.id);
    expect(themes).toEqual(['phone', 'scene', 'security']);
  });
});

describe('safety', () => {
  it('refuses the working checkout and a plain repository', () => {
    expect(() => lib.assertThrowawayClone(process.cwd())).toThrow(/not a throwaway clone/);
    const plain = join(scratch, 'plain');
    mkdirSync(plain);
    git(plain, ['init', '-q']);
    expect(() => lib.assertThrowawayClone(plain)).toThrow(/not a throwaway clone/);
  });

  it('accepts a marked clone, but not one that still has an origin', () => {
    const dir = join(scratch, 'marked');
    mkdirSync(dir);
    git(dir, ['init', '-q']);
    writeFileSync(join(dir, '.git', lib.CLONE_MARKER), '{"source":"/nowhere"}');
    expect(lib.assertThrowawayClone(dir).source).toBe('/nowhere');
    git(dir, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
    expect(() => lib.assertThrowawayClone(dir)).toThrow(/remote origin/);
  });

  it('refuses an output directory that exists with content or sits inside the source', () => {
    const source = syntheticRepo('src-guard');
    expect(() => lib.assertFreshOutput(source, source)).toThrow(/not empty/);
    expect(() => lib.assertFreshOutput(join(source, 'inside'), source)).toThrow(
      /inside the source/,
    );
    expect(() => lib.assertFreshOutput(join(scratch, 'fresh-out'), source)).not.toThrow();
  });
});

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
