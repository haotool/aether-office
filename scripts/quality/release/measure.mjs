import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { COGNITIVE_LIMIT } from '../ast.mjs';
import { inlinePairs } from '../areas/a11y.mjs';
import { LIMITS } from '../areas/structure.mjs';
import { FLAKY } from '../areas/tests.mjs';
import { findDuplicates } from '../dup.mjs';
import { deadExports, fanIn } from '../graph.mjs';
import { at, fanInExcludedTarget, isSourceFile, locations, scan, top } from '../lib.mjs';
import { parseFanInAllowlist } from './adr-allowlist.mjs';
import { listRootItems } from './root-items.mjs';
import { CODE_FILE, PRODUCT_SOURCE, lineCount, matching } from '../repo.mjs';

const GENERATED = /(^|\/)generated\//;
const TESTS_DIR = /^tests\//;

export const RESIDUE_PATTERNS = [
  { id: 'wave', re: /(?:^|\/)[^/]*(?:-wave\d+|wave\d)[^/]*$/i },
  { id: 'iter', re: /(?:^|\/)[^/]*iterations[^/]*$/i },
  { id: 'final', re: /(?:^|\/)[^/]*final[^/]*$/i },
  { id: 'follow-up', re: /(?:^|\/)[^/]*follow-up[^/]*$/i },
  { id: 'zN', re: /(?:^|\/)[^/]*z\d+[^/]*$/i },
  { id: 'tmp', re: /(?:^|\/)[^/]*(?:^tmp|[-_]tmp)[^/]*$/i },
  { id: 'old', re: /(?:^|\/)[^/]*(?:^old|[-_]old)[^/]*$/i },
  { id: 'copy', re: /(?:^|\/)[^/]*(?:^copy|[-_]copy)[^/]*$/i },
];

export const RESIDUE_EXCEPTIONS = new Set([
  'apps/control/src/services/platform/oldest-entry.ts',
  'packages/providers/generated/codex-0.159.2-ts/v2/FsCopyParams.ts',
  'packages/providers/generated/codex-0.159.2-ts/v2/FsCopyResponse.ts',
]);

export function measureResiduePaths(repo) {
  const hits = [];
  for (const file of repo.files) {
    if (GENERATED.test(file) || RESIDUE_EXCEPTIONS.has(file)) continue;
    for (const { id, re } of RESIDUE_PATTERNS)
      if (re.test(file)) {
        hits.push(at(file, 1, `residue:${id}`));
        break;
      }
  }
  return { violations: hits.length, value: hits.length, detail: hits };
}

export function measureTypeEscapes(facts) {
  const source = facts.filter((f) => isSourceFile(f.file));
  const nonNull = source.reduce((n, f) => n + f.nonNull.length, 0);
  const casts = source.reduce((n, f) => n + f.unknownCasts.length, 0);
  const any = source.reduce((n, f) => n + f.any.length, 0);
  return {
    violations: nonNull + casts + any,
    value: nonNull + casts + any,
    detail: top([
      ...locations(source, 'nonNull').slice(0, 15),
      ...locations(source, 'unknownCasts').slice(0, 15),
      ...locations(source, 'any').slice(0, 15),
    ]),
  };
}

export function measureStructureSize(repo, facts) {
  const source = facts.filter((f) => isSourceFile(f.file) && !GENERATED.test(f.file));
  const sizes = repo.files
    .filter((f) => CODE_FILE.test(f) && !GENERATED.test(f))
    .map((file) => ({ file, lines: lineCount(repo.read(file)) }));
  const soft = sizes.filter((s) => s.lines > LIMITS.fileSoft).length;
  const long = source
    .flatMap((f) => f.functions)
    .filter((fn) => fn.length > LIMITS.functionLines).length;
  const deep = source
    .flatMap((f) => f.functions)
    .filter((fn) => fn.nesting > LIMITS.nesting).length;
  const violations = soft + long + deep;
  return {
    violations,
    value: violations,
    detail: top([
      ...sizes
        .filter((s) => s.lines > LIMITS.fileSoft)
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 8)
        .map((s) => at(s.file, 1, `${s.lines} lines`)),
      ...source
        .flatMap((f) => f.functions.map((fn) => ({ ...fn, file: f.file })))
        .filter((fn) => fn.length > LIMITS.functionLines)
        .slice(0, 8)
        .map((fn) => at(fn.file, fn.line, `${fn.name} ${fn.length} lines`)),
    ]),
  };
}

export function measureCognitive(facts) {
  const hot = facts
    .filter((f) => isSourceFile(f.file) && !GENERATED.test(f.file))
    .flatMap((f) =>
      f.functions
        .filter((fn) => fn.cognitive > COGNITIVE_LIMIT)
        .map((fn) => ({ ...fn, file: f.file })),
    );
  return {
    violations: hot.length,
    value: hot.length,
    detail: top(hot.map((fn) => at(fn.file, fn.line, `${fn.name} cognitive ${fn.cognitive}`))),
  };
}

export function measureDuplicates(repo) {
  const sources = repo.files
    .filter((f) => PRODUCT_SOURCE.test(f) && !GENERATED.test(f))
    .map((file) => ({ file, text: repo.read(file) }));
  const dup = findDuplicates(sources);
  const share = dup.totalLines === 0 ? 0 : (dup.duplicatedLines / dup.totalLines) * 100;
  const violations =
    share <= LIMITS.duplicateShare
      ? 0
      : Math.max(1, Math.ceil((share - LIMITS.duplicateShare) / 3));
  return {
    violations,
    value: Number(share.toFixed(2)),
    detail: top([
      `duplicate share ${share.toFixed(2)}%`,
      ...dup.clusters.slice(0, 5).map((c) => `${c.lines} lines x${c.copies.length}`),
    ]),
  };
}

export function isAmbientTypeReference(file, text) {
  return (
    file.endsWith('.d.ts') &&
    /^\s*\/\/\/\s*<reference\s+types=/.test(text) &&
    !/\bexport\b/.test(text)
  );
}

export function measureDeadCode(repo, facts, graph) {
  const productFacts = facts.filter((f) => PRODUCT_SOURCE.test(f.file));
  const dead = deadExports(productFacts, graph.uses, {
    isEntry: (f) => /\/main\.tsx?$/.test(f),
  });
  const imported = new Set();
  for (const [, targets] of graph.runtime) for (const t of targets) imported.add(t);
  const orphanFiles = productFacts
    .map((f) => f.file)
    .filter(
      (file) =>
        !imported.has(file) &&
        !/\/main\.tsx?$/.test(file) &&
        !isAmbientTypeReference(file, repo.read(file)),
    );
  const depViolations = unusedDependencies(repo);
  const violations = dead.length + orphanFiles.length + depViolations.length;
  return {
    violations,
    value: violations,
    detail: top([
      ...dead.slice(0, 10).map((d) => at(d.file, d.line, d.name)),
      ...orphanFiles.slice(0, 10).map((f) => at(f, 1, 'orphan module')),
      ...depViolations.slice(0, 5),
    ]),
  };
}

function unusedDependencies(repo) {
  const manifests = matching(repo, /^(apps|packages)\/[^/]+\/package\.json$/);
  const corpus = repo.files
    .filter((f) => /\.(ts|tsx|mjs)$/.test(f))
    .map((f) => repo.read(f))
    .join('\n');
  const unused = [];
  for (const file of manifests) {
    let pkg;
    try {
      pkg = JSON.parse(repo.read(file));
    } catch {
      continue;
    }
    for (const section of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(pkg[section] ?? {})) {
        const bare = name.replace(/^@[^/]+\//, '').split('/')[0];
        if (
          !corpus.includes(name) &&
          !corpus.includes(`'${bare}'`) &&
          !corpus.includes(`"${bare}"`)
        )
          unused.push(`${file}: unused ${section} ${name}`);
      }
    }
  }
  return unused;
}

export function measureInlineI18n(repo) {
  const inline = inlinePairs(repo);
  const total = Object.values(inline).reduce((n, v) => n + v, 0);
  return {
    violations: total,
    value: total,
    detail: top(Object.entries(inline).map(([f, n]) => at(f, 1, `${n} inline pairs`))),
  };
}

export function measureDirFileCount(repo) {
  const counts = new Map();
  for (const file of repo.files) {
    if (GENERATED.test(file) || TESTS_DIR.test(file)) continue;
    const dir = path.posix.dirname(file);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  const over = [...counts.entries()].filter(([, n]) => n > 40).sort((a, b) => b[1] - a[1]);
  return {
    violations: over.length,
    value: over.length,
    detail: top(over.map(([dir, n]) => `${dir}: ${n} files`)),
  };
}

export function measureFanIn(graph, repo = null) {
  const allow = repo
    ? parseFanInAllowlist(repo)
    : { allowed: new Set(), violations: 0, detail: [] };
  const importers = [...fanIn(graph.runtime, (f) => PRODUCT_SOURCE.test(f))].filter(
    ([file, n]) =>
      n > LIMITS.fanIn &&
      !/\/index\.tsx?$/.test(file) &&
      !fanInExcludedTarget(file) &&
      !allow.allowed.has(file),
  );
  return {
    violations: importers.length + allow.violations,
    value: importers.length + allow.violations,
    detail: top([...allow.detail, ...importers.map(([file, n]) => at(file, 1, `${n} importers`))]),
  };
}

export function measureFileLines(repo) {
  const lines = repo.files
    .filter((f) => PRODUCT_SOURCE.test(f) && !GENERATED.test(f))
    .map((f) => lineCount(repo.read(f)))
    .sort((a, b) => a - b);
  if (lines.length === 0) return { violations: 0, value: 0, detail: [] };
  const median = lines[Math.floor(lines.length / 2)];
  const p95 = lines[Math.floor(lines.length * 0.95)];
  let violations = 0;
  if (median > 120) violations += 1;
  if (p95 > 300) violations += 1;
  if (p95 > 400) violations += 1;
  return {
    violations,
    value: p95,
    detail: [`median ${median} lines`, `p95 ${p95} lines`],
  };
}

const LEDGER = 'docs/verification/features.json';
const FLAKY_RELEASE = [
  ...FLAKY,
  {
    name: 'hard-coded 43xx port in tests',
    where: /^tests\//,
    pattern: /\b43\d{2}\b/,
  },
];

export function measureFlaky(repo) {
  const flaky = FLAKY_RELEASE.flatMap(({ name, where, pattern }) =>
    scan(
      repo,
      repo.files.filter((f) => where.test(f)),
      pattern,
      { say: () => name },
    ),
  );
  return {
    violations: flaky.length,
    value: flaky.length,
    detail: top(flaky),
  };
}

export function measureLedgerTests(repo) {
  if (!repo.exists(LEDGER)) return { violations: 1, value: 0, detail: [`missing ${LEDGER}`] };
  const entries = JSON.parse(repo.read(LEDGER));
  const bad = [];
  for (const entry of entries) {
    const ids = entry.testIds ?? [];
    const ok = ids.some((id) => repo.exists(id));
    if (!ok) bad.push(`${entry.id}: no existing testIds (${ids.join(', ') || 'none'})`);
  }
  return { violations: bad.length, value: bad.length, detail: top(bad) };
}

export function measureGitHygiene(root) {
  const worktrees = execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean).length;
  const branches = execFileSync('git', ['-C', root, 'branch', '--format=%(refname:short)'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean).length;
  const stash = execFileSync('git', ['-C', root, 'stash', 'list'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean).length;
  let violations = 0;
  const allowedWorktrees = 2;
  if (worktrees > allowedWorktrees) violations += worktrees - allowedWorktrees;
  if (branches > 3) violations += branches - 3;
  violations += stash;
  return {
    violations,
    value: worktrees + branches + stash,
    detail: [
      `worktrees ${worktrees} (allowed ${allowedWorktrees})`,
      `local branches ${branches} (limit 3)`,
      `stash entries ${stash}`,
    ],
  };
}

export function measureRootItems(root) {
  const items = listRootItems(root);
  const violations = Math.max(0, items.length - 25);
  return {
    violations,
    value: items.length,
    detail: [`${items.length} top-level entries`, ...items.slice(0, 30)],
  };
}
