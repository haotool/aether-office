import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

const within = (parent: string, child: string) =>
  child === parent || child.startsWith(parent + sep);

/**
 * A runner's journal, spool and checkouts must never live inside a repository it may use, so
 * runner state (and any SQLite file) can never be committed or shared through a .git directory.
 * Each machine works from its own clone; nothing here is ever shared between machines.
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
