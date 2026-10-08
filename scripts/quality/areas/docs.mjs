// Area 7: docs truth. Links resolve, the commands, environment variables and files the docs name exist, the required
// documents are there and the generated ones are fresh. Research and internal notes and the changelog describe history, so they are
// not held to the "still exists" rules.
import path from 'node:path';
import { SELF, top } from '../lib.mjs';
import { rule } from '../model.mjs';
import { matching, runCommand } from '../repo.mjs';

export const HISTORY =
  /^(docs\/(research|internal)\/|CHANGELOG\.md|docs\/verification\/|docs\/adr\/)/;
export const PNPM_BUILTINS = new Set([
  'install',
  'i',
  'add',
  'remove',
  'rm',
  'update',
  'up',
  'exec',
  'dlx',
  'audit',
  'outdated',
  'why',
  'list',
  'ls',
  'store',
  'approve-builds',
  'rebuild',
  'prune',
  'publish',
  'pack',
  'link',
  'config',
  'env',
  'import',
  'fetch',
  'deploy',
  'licenses',
  'self-update',
]);
const REQUIRED = [
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE',
  'docs/development.md',
  'docs/architecture.md',
];
const PATH_REFERENCE =
  /`((?:apps|packages|scripts|docs|tests|e2e|tools|\.github)\/[\w@./-]+\.(?:ts|tsx|mjs|md|json|css|sh|yml|toml))(?::\d+)?`/g;

const currentDocs = (repo) =>
  matching(repo, /\.md$/).filter((f) => !HISTORY.test(f) && !SELF.test(f));

/** What a reader would type: the lines of fenced code blocks and the inline `code` spans of the other lines. */
function codeSegments(lines) {
  let fenced = false;
  return lines.map((line) => {
    if (line.trim().startsWith('```')) {
      fenced = !fenced;
      return '';
    }
    return fenced ? line : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]).join('\n');
  });
}

/** `pnpm <name>` commands in markdown code that are neither a script of package.json nor a pnpm built-in. */
export function unknownCommands(text, scripts) {
  const out = [];
  codeSegments(text.split('\n')).forEach((code, i) => {
    for (const m of code.matchAll(/\bpnpm\s+(?:run\s+)?([a-z][\w:-]*)/g)) {
      const name = m[1];
      if (!scripts.has(name) && !PNPM_BUILTINS.has(name)) out.push({ line: i + 1, name });
    }
  });
  return out;
}

export function envNames(text) {
  return [...text.matchAll(/\bAETHER_[A-Z0-9]+(?:_[A-Z0-9]+)*\b/g)].map((m) => m[0]);
}

/** Backticked repository paths in `text` that do not exist (globs and placeholders are skipped). */
export function missingPaths(text, exists, from = '') {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(PATH_REFERENCE)) {
      const ref = m[1];
      if (/[*<>{}]/.test(ref)) continue;
      const candidates = [ref, path.posix.join(path.posix.dirname(from), ref)];
      if (!candidates.some(exists)) out.push({ line: i + 1, ref });
    }
  });
  return out;
}

export function docs(repo, { readiness = [] } = {}) {
  const scripts = new Set(Object.keys(JSON.parse(repo.read('package.json') || '{}').scripts ?? {}));
  const files = currentDocs(repo);
  const badCommands = files.flatMap((f) =>
    unknownCommands(repo.read(f), scripts).map((h) => `${f}:${h.line} pnpm ${h.name}`),
  );
  const codeFiles = repo.files.filter(
    (f) =>
      /^(apps|packages|scripts|tests|e2e|tools|\.github)\//.test(f) ||
      f === 'package.json' ||
      f === 'playwright.config.ts',
  );
  const defined = new Set(codeFiles.flatMap((f) => envNames(repo.read(f))));
  const badEnv = files.flatMap((f) =>
    repo
      .read(f)
      .split('\n')
      .flatMap((text, i) =>
        envNames(text)
          .filter((n) => !defined.has(n))
          .map((n) => `${f}:${i + 1} ${n}`),
      ),
  );
  const badPaths = files.flatMap((f) =>
    missingPaths(repo.read(f), repo.exists, f).map((h) => `${f}:${h.line} ${h.ref}`),
  );
  const absent = REQUIRED.filter((f) => !repo.exists(f));
  const links = readiness.find((r) => r.id === 'doc-links');
  const ledger = runCommand(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/verification-ledger.ts', '--check'],
    { cwd: repo.root },
  );
  const notices = runCommand(process.execPath, ['scripts/oss/third-party-notices.mjs', '--check'], {
    cwd: repo.root,
  });
  const lines = (run) =>
    run.status === 0
      ? []
      : run.output
          .split('\n')
          .filter((l) => l.trim())
          .slice(0, 5);
  return [
    rule({
      id: 'doc-links',
      label: 'Markdown links that do not resolve (oss:check)',
      weight: 20,
      value: links?.lines.length ?? 0,
      full: 5,
      details: top(links?.lines ?? []),
    }),
    rule({
      id: 'doc-commands',
      label: 'Documented pnpm commands that do not exist',
      weight: 20,
      value: badCommands.length,
      full: 8,
      details: top(badCommands),
    }),
    rule({
      id: 'doc-env',
      label: 'Documented AETHER_* variables no code reads',
      weight: 15,
      value: badEnv.length,
      full: 5,
      details: top(badEnv),
    }),
    rule({
      id: 'doc-paths',
      label: 'Documented file paths that do not exist',
      weight: 20,
      value: badPaths.length,
      full: 12,
      details: top(badPaths),
    }),
    rule({
      id: 'required-docs',
      label: 'Required documents missing',
      weight: 5,
      value: absent.length,
      full: 1,
      details: absent,
    }),
    rule({
      id: 'ledger',
      label: 'Verification ledger consistent and report fresh (verification:check)',
      weight: 12,
      value: ledger.status === 0 ? 0 : 1,
      full: 1,
      details: lines(ledger),
    }),
    rule({
      id: 'notices',
      label: 'THIRD_PARTY_NOTICES.md fresh (notices --check)',
      weight: 8,
      value: notices.status === 0 ? 0 : 1,
      full: 1,
      details: lines(notices),
    }),
  ];
}
