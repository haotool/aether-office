import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const load = (name: string) => import(pathToFileURL(resolve('scripts/quality/release', name)).href);
const loadRoot = (name: string) => import(pathToFileURL(resolve('scripts/quality', name)).href);

const { evidenceForCriteria, evidenceRow, loadEvidence, resolveEvidencePath, EVIDENCE_PATH } =
  await load('evidence.mjs');
const { memoryRepo } = await loadRoot('repo.mjs');

const VALID_E = 'L1-10';

describe('resolveEvidencePath', () => {
  it('rejects parent segments and absolute paths', () => {
    const root = '/repo';
    expect(resolveEvidencePath(root, '../etc/passwd')).toBeNull();
    expect(resolveEvidencePath(root, '/etc/passwd')).toBeNull();
    expect(resolveEvidencePath(root, 'package.json')).toBe('package.json');
    expect(resolveEvidencePath(root, 'src/../package.json')).toBe('package.json');
  });
});

describe('loadEvidence', () => {
  it('accepts a valid empty array', () => {
    const repo = memoryRepo({ [EVIDENCE_PATH]: '[]' });
    expect(loadEvidence(repo)).toEqual({ entries: [], error: null });
  });

  it('rejects malformed JSON', () => {
    const repo = memoryRepo({ [EVIDENCE_PATH]: '{not json' });
    const got = loadEvidence(repo);
    expect(got.entries).toEqual([]);
    expect(got.error).toMatch(/invalid JSON/);
  });

  it('rejects non-array top-level JSON', () => {
    const repo = memoryRepo({ [EVIDENCE_PATH]: '{"entries":[]}' });
    const got = loadEvidence(repo);
    expect(got.error).toMatch(/must be a JSON array/);
  });
});

describe('evidenceRow', () => {
  const head = 'abc123';

  it('accepts valid evidence', () => {
    const repo = memoryRepo({
      'docs/foo.md': '# ok',
      [EVIDENCE_PATH]: '[]',
    });
    const row = evidenceRow(
      repo,
      { id: VALID_E, credit: 1, files: ['docs/foo.md'], note: 'reviewed' },
      head,
    );
    expect(row).toMatchObject({ id: VALID_E, credit: 1 });
  });

  it('rejects unknown criterion id', () => {
    const row = evidenceRow(repoWith([]), { id: 'L9-99', credit: 1 }, head);
    expect(row).toHaveProperty('error');
  });

  it('rejects credit outside 0, 0.5, 1', () => {
    const row = evidenceRow(repoWith([]), { id: VALID_E, credit: 0.25 }, head);
    expect(row).toHaveProperty('error');
  });

  it('rejects missing files', () => {
    const row = evidenceRow(repoWith([]), { id: VALID_E, credit: 1, files: ['missing.md'] }, head);
    expect(row).toHaveProperty('error');
  });

  it('rejects parent-segment paths', () => {
    const row = evidenceRow(
      memoryRepo({ [EVIDENCE_PATH]: '[]', 'package.json': '{}' }),
      { id: VALID_E, credit: 1, files: ['../package.json'] },
      head,
    );
    expect(row).toHaveProperty('error');
  });

  it('rejects sha not ancestral to HEAD', () => {
    const root = resolve('.');
    const headSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const repo = memoryRepo({ [EVIDENCE_PATH]: '[]', root });
    const row = evidenceRow(
      { ...repo, root },
      { id: VALID_E, credit: 1, sha: '0'.repeat(40) },
      headSha,
    );
    expect(row).toHaveProperty('error');
  });
});

describe('evidenceForCriteria', () => {
  it('returns a map for valid evidence', () => {
    const repo = repoWith([{ id: VALID_E, credit: 0.5, note: 'partial' }]);
    const { evidence, error } = evidenceForCriteria(repo, 'deadbeef');
    expect(error).toBeNull();
    expect(evidence.get(VALID_E)?.credit).toBe(0.5);
  });

  it('invalidates the file on duplicate ids', () => {
    const repo = repoWith([
      { id: VALID_E, credit: 1 },
      { id: VALID_E, credit: 0.5 },
    ]);
    const { evidence, error } = evidenceForCriteria(repo, 'deadbeef');
    expect(evidence.size).toBe(0);
    expect(error).toMatch(/duplicate criterion id/);
  });

  it('invalidates the file on bad entry shape', () => {
    const repo = memoryRepo({ [EVIDENCE_PATH]: '[null]' });
    const { error } = evidenceForCriteria(repo, 'deadbeef');
    expect(error).toMatch(/must be an object with an id string/);
  });
});

function repoWith(entries: unknown[]) {
  return memoryRepo({ [EVIDENCE_PATH]: JSON.stringify(entries) });
}
