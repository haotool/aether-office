import { fuzzyRank } from '@aether/kernel';
import { git } from '../git/git-health.js';

const MAX_FILE_RESULTS = 20;
export const MAX_QUERY_CHARS = 100;
const MAX_LISTED_BYTES = 4 * 1024 * 1024;
// Files that hold credentials are never offered for completion, even when Git does not ignore them.
const SECRET_FILE =
  /(?:^|\/)(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|[^/]*\.(?:pem|key|p12|pfx))$/i;

export function completePaths(paths: readonly string[], query: string, limit: number): string[] {
  const usable = paths.filter(
    (p) => p && !p.startsWith('/') && !p.split('/').includes('..') && !SECRET_FILE.test(p),
  );
  return fuzzyRank(query.slice(0, MAX_QUERY_CHARS), usable, (p) => p, limit);
}

/**
 * Nothing outside the work tree is reached: a directory that is not a Git work tree has no files, `cwd` is the
 * session's own (looked up on the server) and the query only filters the listing, never names a path.
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
