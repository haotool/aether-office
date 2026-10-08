// Additional CHARTER §5.3 M criteria for release mode (static / recorded inputs only).
import { execFileSync, spawnSync } from 'node:child_process';
import { parityGaps, inlinePairs } from '../areas/a11y.mjs';
import { HISTORY } from '../areas/docs.mjs';
import { ui } from '../areas/ui.mjs';
import { at, top } from '../lib.mjs';
import { runCommand } from '../repo.mjs';
import { conventional, SUBJECT_MAX } from '../../oss/git-messages.mjs';
import { readCommits, upstreamSet } from '../../oss/history-groups.mjs';

const COVERAGE_PATH = 'coverage/coverage-summary.json';
const SKIP_SUBJECT = /^(Merge |Revert "|fixup! |squash! )|^Merge branch 'worktree-agent-/;

/** Charter L3-03: shortfall in percentage points vs 80% lines / 70% branches. */
export function coverageViolations(linePct, branchPct) {
  return Math.max(0, 80 - linePct, 70 - branchPct);
}

/** @param {import('../repo.mjs').Repo} repo */
export function measureCoverage(repo) {
  if (!repo.exists(COVERAGE_PATH)) {
    return {
      unmeasured: true,
      detail: [`missing ${COVERAGE_PATH}`, 'generate with: pnpm test:coverage'],
    };
  }
  let summary;
  try {
    summary = JSON.parse(repo.read(COVERAGE_PATH));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { unmeasured: true, detail: [`invalid ${COVERAGE_PATH}: ${message}`] };
  }
  const total = summary.total ?? summary;
  const linePct = total?.lines?.pct;
  const branchPct = total?.branches?.pct;
  if (typeof linePct !== 'number' || typeof branchPct !== 'number') {
    return { unmeasured: true, detail: [`${COVERAGE_PATH} missing lines/branches pct`] };
  }
  const violations = coverageViolations(linePct, branchPct);
  return {
    violations,
    value: linePct,
    detail: [
      `lines ${linePct}% (pass ≥80%)`,
      `branches ${branchPct}% (pass ≥70%)`,
      `shortfall ${violations} percentage points (failAt 30)`,
    ],
  };
}

/** @param {import('../repo.mjs').Repo} repo @param {string} root */
export function measureDesignTokens(repo, root) {
  const rules = ui(repo, { root });
  const lint = rules.find((r) => r.id === 'token-lint');
  const escapes = rules.find((r) => r.id === 'escape-comments');
  const lintViolations = lint?.value ?? 0;
  const escapeCount = escapes?.value ?? 0;
  const escapeOver = Math.max(0, escapeCount - 100);
  const violations = lintViolations + escapeOver;
  return {
    violations,
    value: violations,
    detail: top([
      `token-lint violations ${lintViolations}`,
      `escape comments ${escapeCount} (budget 100, excess ${escapeOver})`,
      ...(lint?.details ?? []).slice(0, 5),
    ]),
  };
}

/** @param {import('../repo.mjs').Repo} repo */
export function measureLocaleCompleteness(repo) {
  const gaps = parityGaps(repo);
  const inline = Object.values(inlinePairs(repo)).reduce((n, v) => n + v, 0);
  const violations = gaps.length + inline;
  return {
    violations,
    value: violations,
    detail: top([
      ...gaps.slice(0, 10).map((g) => g.message),
      ...(inline ? [`inline bilingual sites ${inline}`] : []),
    ]),
  };
}

/** @param {import('../repo.mjs').Repo} repo */
export function measureRefetchInterval(repo) {
  const files = repo.files.filter((f) => /^apps\/web\/src\/.*\.tsx?$/.test(f));
  const sites = [];
  for (const file of files) {
    const text = repo.read(file);
    for (const m of text.matchAll(/\brefetchInterval\b/g)) {
      const line = text.slice(0, m.index).split('\n').length;
      sites.push(at(file, line, 'refetchInterval'));
    }
  }
  return { violations: sites.length, value: sites.length, detail: top(sites) };
}

const STYLE_CSS = /^apps\/web\/src\/styles\/.*\.css$/;
const BLUR_USE = /(?:-webkit-)?backdrop-filter:\s*blur|filter:\s*blur\s*\(/i;
const BLUR_OK = /\/\*\s*blur-ok:/;

export function blurLineCounts(text) {
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (!BLUR_USE.test(line) || /\bnone\b/i.test(line)) return;
    if (BLUR_OK.test(line) || (i > 0 && BLUR_OK.test(lines[i - 1]))) return;
    hits.push(i + 1);
  });
  return hits;
}

/** @param {import('../repo.mjs').Repo} repo */
export function measureCompactBlur(repo) {
  const files = repo.files.filter((f) => STYLE_CSS.test(f));
  const hits = [];
  for (const file of files) {
    const lines = repo.read(file).split('\n');
    for (const lineNo of blurLineCounts(repo.read(file))) {
      hits.push(at(file, lineNo, lines[lineNo - 1].trim()));
    }
  }
  return { violations: hits.length, value: hits.length, detail: top(hits) };
}

function paragraphMixed(text) {
  const hasLatin = /[A-Za-z]{3,}/.test(text);
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  return hasLatin && hasCjk;
}

/** @param {import('../repo.mjs').Repo} repo */
export function measureMixedLanguageDocs(repo) {
  const files = repo.files.filter(
    (f) => f.startsWith('docs/') && f.endsWith('.md') && !HISTORY.test(f),
  );
  const hits = [];
  for (const file of files) {
    const paragraphs = repo.read(file).split(/\n\s*\n/);
    paragraphs.forEach((para, i) => {
      if (paragraphMixed(para)) hits.push(`${file}: paragraph ${i + 1} mixes English and Chinese`);
    });
  }
  return { violations: hits.length, value: hits.length, detail: top(hits) };
}

const CHANGELOG = 'CHANGELOG.md';
const CHANGELOG_BYTES = 32 * 1024;
const CHANGELOG_KINDS = new Set([
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
  'Upgrade notes',
]);
const RELEASE_HEADING = /^## (\[Unreleased\]|\[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2})$/;
const WORKING_WORDS = /\b(wave \d|track [A-F]|WP-?\d|PM-)\b/;

/** Charter L6-05: Keep a Changelog layout, no working vocabulary, and a size a reader can finish (one violation per 4 KB over). */
export function measureChangelog(repo) {
  if (!repo.exists(CHANGELOG)) return { unmeasured: true, detail: [`missing ${CHANGELOG}`] };
  const text = repo.read(CHANGELOG);
  const hits = [];
  let kinds = new Set();
  text.split('\n').forEach((line, i) => {
    const where = `${CHANGELOG}:${i + 1}`;
    if (line.startsWith('## ')) {
      kinds = new Set();
      if (!RELEASE_HEADING.test(line)) hits.push(`${where} release heading: ${line}`);
    } else if (line.startsWith('### ')) {
      const kind = line.slice(4);
      if (!CHANGELOG_KINDS.has(kind) || kinds.has(kind)) hits.push(`${where} section: ${kind}`);
      kinds.add(kind);
    }
    if (WORKING_WORDS.test(line)) hits.push(`${where} working vocabulary`);
  });
  if (!text.includes('\n## [Unreleased]\n')) hits.push(`${CHANGELOG} has no [Unreleased] section`);
  const over = Math.ceil(Math.max(0, Buffer.byteLength(text) - CHANGELOG_BYTES) / 4096);
  for (let n = 0; n < over; n++) hits.push(`${CHANGELOG} is over ${CHANGELOG_BYTES / 1024} KB`);
  return { violations: hits.length, value: hits.length, detail: top(hits) };
}

function subjectViolation(subject) {
  if (SKIP_SUBJECT.test(subject)) return null;
  if (subject.length > SUBJECT_MAX) return `subject ${subject.length} chars (max ${SUBJECT_MAX})`;
  if (!conventional(subject)) return 'non-conventional subject';
  return null;
}

/** @param {string} root @param {string} [range] */
export function measureConventionalCommits(root, range = 'HEAD') {
  const out = execFileSync('git', ['-C', root, 'log', '--format=%s', range], {
    encoding: 'utf8',
  });
  const hits = [];
  for (const subject of out.split('\n').filter(Boolean)) {
    const problem = subjectViolation(subject);
    if (problem) hits.push(`${problem}: ${subject.slice(0, 72)}`);
  }
  return {
    violations: hits.length,
    value: hits.length,
    detail: top(hits),
  };
}

/** @param {string} root */
export function measureAuthorIdentities(root) {
  const commits = readCommits(root, 'HEAD');
  const maintainer = commits[0]?.author.email ?? '';
  const upstream = upstreamSet(commits, maintainer ? [maintainer] : []);
  const own = commits.filter((c) => !upstream.has(c.hash));
  const emails = new Set(own.map((c) => c.author.email.toLowerCase()));
  const violations = Math.max(0, emails.size - 1);
  return {
    violations,
    value: emails.size,
    detail: [
      `${emails.size} maintainer author email(s) on non-upstream commits`,
      ...top([...emails].map((e) => e)),
    ],
  };
}

/** @param {string} root */
export function measureDependencyAudit(root) {
  const result = spawnSync('pnpm', ['audit', '--json', '--audit-level=high'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error?.code === 'ENOENT') {
    return { unmeasured: true, detail: ['pnpm not available for audit'] };
  }
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(combined) && !result.stdout?.trim()) {
    return { unmeasured: true, detail: ['pnpm audit unavailable (network)'] };
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout || '{}');
  } catch {
    return { unmeasured: true, detail: ['pnpm audit returned non-JSON output'] };
  }
  const advisories = Object.values(payload.advisories ?? {});
  const critical = advisories.filter((a) => a.severity === 'critical').length;
  const high = advisories.filter((a) => a.severity === 'high').length;
  const violations = critical + high;
  return {
    violations,
    value: violations,
    detail: top([
      `high ${high}`,
      `critical ${critical}`,
      ...(result.status !== 0 && violations === 0
        ? ['audit exit non-zero with no parsed advisories']
        : []),
    ]),
  };
}
