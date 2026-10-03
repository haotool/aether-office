import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { assertIndependentStorage } from '../../apps/runner/src/storage.js';

it('refuses runner storage that nests with a repository, including through symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'aether-storage-'));
  const repo = join(root, 'repo');
  const data = join(root, 'data');
  mkdirSync(repo);
  mkdirSync(data);
  expect(() => assertIndependentStorage(data, [repo])).not.toThrow();

  const nested = join(repo, '.aether');
  mkdirSync(nested);
  expect(() => assertIndependentStorage(nested, [repo])).toThrow('STORAGE_SHARES_REPOSITORY'); // runner state inside the work tree
  expect(() => assertIndependentStorage(repo, [data, repo])).toThrow('STORAGE_SHARES_REPOSITORY'); // same directory
  expect(() => assertIndependentStorage(root, [repo])).not.toThrow(); // a repository next to runner state is fine

  const link = join(root, 'link');
  symlinkSync(repo, link);
  expect(() => assertIndependentStorage(join(link, '.aether'), [repo])).toThrow(
    'STORAGE_SHARES_REPOSITORY',
  ); // via symlink
});
