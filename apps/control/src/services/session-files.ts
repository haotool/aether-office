import { fuzzyRank } from '@aether/kernel';
import { git } from './git-health.js';

const MAX_FILE_RESULTS = 20;
export const MAX_QUERY_CHARS = 100;
const MAX_LISTED_BYTES = 4 * 1024 * 1024;
// Files that hold credentials are never offered for completion, even when Git does not ignore them.
const SECRET_FILE =
  /(?:^|\/)(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|[^/]*\.(?:pem|key|p12|pfx))$/i;

/** Pure. Which of `paths` complete `query`, best first: never an absolute path, a `..` step or a credentials file. */
export function completePaths(paths: readonly string[], query: string, limit: number): string[] {
  const usable = paths.filter(
    (p) => p && !p.startsWith('/') && !p.split('/').includes('..') && !SECRET_FILE.test(p),
  );
  return fuzzyRank(query.slice(0, MAX_QUERY_CHARS), usable, (p) => p, limit);
}

/**
 * File paths of a session's directory for `@` completion: what Git knows there (tracked, or untracked and not ignored),
 * relative to it. A directory that is not a Git work tree has none: nothing is walked, so nothing outside is reached.
 * `cwd` is the session's own, looked up on the server; the query is only ever a filter on the listing, never a path.
 */
export async function listSessionFiles(cwd: string, query: string): Promise<string[]> {
  try {
    const stdout = await git(
      cwd,
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      3000,
      MAX_LISTED_BYTES,
    );
    return completePaths(stdout.split('\0'), query, MAX_FILE_RESULTS);
  } catch {
    return [];
  }
}
