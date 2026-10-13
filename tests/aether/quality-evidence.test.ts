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
const root = resolve('.');
const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const anchored = { id: VALID_E, credit: 1, sha: head };

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
  it('accepts valid evidence', () => {
    const repo = memoryRepo({
      'docs/foo.md': '# ok',
      [EVIDENCE_PATH]: '[]',
    });
    const row = evidenceRow(
      { ...repo, root },
      { ...anchored, files: ['docs/foo.md'], note: 'reviewed' },
      head,
    );
    expect(row).toMatchObject({ id: VALID_E, credit: 1 });
  });

  it('requires a full commit sha', () => {
    for (const sha of [undefined, 'abc123'])
      expect(evidenceRow(repoWith([]), { id: VALID_E, credit: 1, sha }, head)).toHaveProperty(
        'error',
      );
  });

  it.each([
    ['unknown criterion', { ...anchored, id: 'L9-99' }],
    ['invalid credit', { ...anchored, credit: 0.25 }],
    ['missing file', { ...anchored, files: ['missing.md'] }],
  ])('rejects %s', (_name, entry) => {
    expect(evidenceRow(repoWith([]), entry, head)).toHaveProperty('error');
  });

  it('rejects parent-segment paths', () => {
    const row = evidenceRow(
      memoryRepo({ [EVIDENCE_PATH]: '[]', 'package.json': '{}' }),
      { ...anchored, files: ['../package.json'] },
      head,
    );
    expect(row).toHaveProperty('error');
  });

  it('rejects sha not ancestral to HEAD', () => {
    const repo = memoryRepo({ [EVIDENCE_PATH]: '[]', root });
    const row = evidenceRow(
      { ...repo, root },
      { id: VALID_E, credit: 1, sha: '0'.repeat(40) },
      head,
    );
    expect(row).toHaveProperty('error');
  });
});

describe('evidenceForCriteria', () => {
  it('invalidates the file on duplicate ids', () => {
    const repo = repoWith([
      { id: VALID_E, credit: 1 },
      { id: VALID_E, credit: 0.5 },
    ]);
    const { evidence, error } = evidenceForCriteria(repo, head);
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
  const anchoredEntries = entries.map((entry) => ({ sha: head, ...(entry as object) }));
  return { ...memoryRepo({ [EVIDENCE_PATH]: JSON.stringify(anchoredEntries) }), root };
}
