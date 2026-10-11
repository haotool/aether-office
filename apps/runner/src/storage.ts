import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

const within = (parent: string, child: string) =>
  child === parent || child.startsWith(parent + sep);

/**
 * Runner state (journal, spool, checkouts, any SQLite file) must never live inside a repository it may use, so it can
 * never be committed or shared through a .git directory.
 */
export function assertIndependentStorage(
  dataDirectory: string,
  repositories: readonly string[],
): void {
  const data = realpathSync(dataDirectory);
  for (const repository of repositories) {
    const repo = realpathSync(repository);
    if (within(repo, data)) throw new Error('STORAGE_SHARES_REPOSITORY');
  }
}
