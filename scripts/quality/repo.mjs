// The repository as the scorer sees it: tracked plus untracked-but-not-ignored files, read lazily and cached.
// Rule modules only receive this object, so tests can hand them an in-memory repository (see `memoryRepo`).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Files the scorer never judges: generated, the ledger, binaries, vendored data and its own output. */
const EXCLUDED =
  /^(THIRD_PARTY_NOTICES\.md|pnpm-lock\.yaml|docs\/verification\/(features\.json|report\.md)|docs\/quality\/(scorecard\.(md|json))|LICENSES\/|assets-source\/|fixtures\/)|(^|\/)generated\/|\.(glb|png|jpe?g|webp|gif|ico|woff2?|svg|mp4|webm|lock)$|\.generated\.|\.min\./;

export const isExcluded = (file) => EXCLUDED.test(file);

export function gitFiles(root) {
  const out = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return out
    .split('\0')
    .filter(Boolean)
    .filter((file) => existsSync(path.join(root, file)));
}

/** A repository on disk: `files` are repo-relative posix paths, `read` returns UTF-8 text ('' when unreadable). */
export function diskRepo(root) {
  const files = gitFiles(root).filter((file) => !isExcluded(file));
  const cache = new Map();
  return {
    root,
    files,
    exists: (file) => existsSync(path.join(root, file)),
    read(file) {
      if (!cache.has(file)) {
        try {
          cache.set(file, readFileSync(path.join(root, file), 'utf8'));
        } catch {
          cache.set(file, '');
        }
      }
      return cache.get(file);
    },
  };
}

/** An in-memory repository for tests: `{ 'a/b.ts': 'text' }`. */
export function memoryRepo(contents) {
  return {
    root: '/memory',
    files: Object.keys(contents),
    exists: (file) => file in contents,
    read: (file) => contents[file] ?? '',
  };
}

export const matching = (repo, pattern) => repo.files.filter((file) => pattern.test(file));

export const lineCount = (text) =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/** Runs a local command without a shell. Never throws; `error` is set when the binary is missing. */
export function runCommand(command, args, { cwd, timeout = 120_000 } = {}) {
  const run = spawnSync(command, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 1 << 26 });
  return {
    status: run.status,
    output: `${run.stdout ?? ''}${run.stderr ?? ''}`,
    error: run.error ? String(run.error.code ?? run.error.message) : null,
  };
}

/** The product source: application and package code under `src`, no tests. */
export const PRODUCT_SOURCE = /^(apps|packages)\/[^/]+\/src\/.*\.(ts|tsx)$/;
export const TEST_FILE = /^(tests|e2e)\/.*\.(ts|tsx)$/;
export const CODE_FILE = /\.(ts|tsx|mjs|css)$/;
