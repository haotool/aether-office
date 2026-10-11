import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Workspaces } from '../../apps/runner/src/workspaces.js';

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'aether matrix 空白 '));
  const repository = join(directory, 'repo');
  execFileSync('git', ['init', '-q', repository]);
  writeFileSync(join(repository, 'a.txt'), 'a\n');
  execFileSync('git', ['-C', repository, 'add', '.']);
  execFileSync('git', [
    '-C',
    repository,
    '-c',
    'user.name=f',
    '-c',
    'user.email=f@x.invalid',
    'commit',
    '-qm',
    'base',
  ]);
  const manager = new Workspaces(join(directory, 'managed'), [repository]);
  const create = () => manager.create(randomUUID(), randomUUID(), 1, repository);
  return {
    directory,
    repository,
    manager,
    create,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

describe('workspace creation refuses unsafe inputs', () => {
  it('rejects malformed ids, attempts, shas and repositories that were not granted', () => {
    const f = setup();
    try {
      expect(() => f.manager.create('../escape', randomUUID(), 1, f.repository)).toThrow();
      expect(() => f.manager.create(randomUUID(), 'bad ref name', 1, f.repository)).toThrow();
      expect(() => f.manager.create(randomUUID(), randomUUID(), 0, f.repository)).toThrow(
        'INVALID_ATTEMPT',
      );
      expect(() => f.manager.create(randomUUID(), randomUUID(), 1.5, f.repository)).toThrow(
        'INVALID_ATTEMPT',
      );
      expect(() => f.manager.create(randomUUID(), randomUUID(), 1, f.directory)).toThrow(
        'REPOSITORY_NOT_GRANTED',
      );
      expect(() =>
        f.manager.create(randomUUID(), randomUUID(), 1, f.repository, {
          runId: randomUUID(),
          headSha: '--upload-pack=x',
        }),
      ).toThrow('INVALID_SHA');
      expect(() =>
        f.manager.create(randomUUID(), randomUUID(), 1, f.repository, {
          runId: randomUUID(),
          headSha: 'f'.repeat(40),
        }),
      ).toThrow();
    } finally {
      f.cleanup();
    }
  });

  it('a granted repository reached through a symlink resolves to the real path, and a symlinked workspace is refused on load', () => {
    const f = setup();
    try {
      const link = join(f.directory, 'repo-link');
      symlinkSync(f.repository, link);
      const viaLink = f.manager.create(randomUUID(), randomUUID(), 1, link);
      expect(viaLink.repository).not.toBe(link);
      const workspace = f.create();
      rmSync(workspace.path, { recursive: true });
      symlinkSync(f.repository, workspace.path);
      expect(() => f.manager.load(workspace.id)).toThrow('WORKSPACE_PATH_ESCAPE');
    } finally {
      f.cleanup();
    }
  });
});

describe('diff degrades safely', () => {
  it('lists untracked files, unicode and spaced names, and reports binary changes without dumping bytes', () => {
    const f = setup();
    try {
      const w = f.create();
      writeFileSync(join(w.path, '新 檔案.txt'), 'x\n');
      writeFileSync(join(w.path, 'image.bin'), Buffer.from([0, 1, 2, 3, 255, 254]));
      writeFileSync(join(w.path, 'a.txt'), 'a changed\n');
      const result = f.manager.diff(w.id);
      expect(result.untracked.sort()).toEqual(['image.bin', '新 檔案.txt']);
      expect(result.text).toContain('a changed');
      expect(result.text).not.toContain('新 檔案');
    } finally {
      f.cleanup();
    }
  });

  it('a very large change is refused with a stable code instead of crashing the runner', () => {
    const f = setup();
    try {
      const w = f.create();
      writeFileSync(join(w.path, 'a.txt'), 'line of text that repeats\n'.repeat(400_000));
      expect(() => f.manager.diff(w.id)).toThrow(/DIFF_TOO_LARGE/);
    } finally {
      f.cleanup();
    }
  });
});
