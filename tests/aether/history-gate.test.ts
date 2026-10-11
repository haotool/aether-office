import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const { SCHEMA, evidenceProblems, shapeProblems } = await import(
  pathToFileURL(resolve('scripts/oss/history-gate.mjs')).href
);

const HEAD = 'a'.repeat(40);
const record = (over: Record<string, unknown> = {}) => ({
  schema: SCHEMA,
  cloneHead: HEAD,
  verdict: 'GO',
  steps: [
    { name: 'structure', state: 'PASS' },
    { name: 'repository size <= 100 MB', state: 'PASS' },
    { name: 'pnpm install --frozen-lockfile --offline', state: 'PASS' },
    { name: 'typecheck', state: 'PASS' },
    { name: 'full test suite', state: 'PASS' },
    { name: 'readiness check (history)', state: 'PASS' },
  ],
  ...over,
});

describe('evidenceProblems', () => {
  it('accepts a passing record for the checked-out commit', () => {
    for (const id of ['L8-01', 'L8-02', 'L8-04'])
      expect(evidenceProblems(id, record(), HEAD)).toEqual([]);
  });

  it('rejects another schema and a record for another commit', () => {
    expect(evidenceProblems('L8-02', { schema: 'x' }, HEAD)).toHaveLength(1);
    expect(evidenceProblems('L8-02', record({ cloneHead: 'b'.repeat(40) }), HEAD)).toEqual([
      expect.stringContaining('bbbbbbbb'),
    ]);
  });

  it('names the failing and the missing step', () => {
    const steps = record().steps.filter((s) => s.name !== 'typecheck');
    steps.find((s) => s.name === 'structure')!.state = 'FAIL';
    expect(evidenceProblems('L8-01', record({ steps, verdict: 'NO-GO' }), HEAD)).toEqual([
      'verdict is NO-GO',
      '"structure" is FAIL',
      'no "typecheck" step',
    ]);
    expect(evidenceProblems('L8-02', record({ steps }), HEAD)).toEqual([]);
  });
});

describe('shapeProblems', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-history-gate-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const git = (args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

  it('is clean for a lone main and flags a tag, a branch and a remote', () => {
    git(['init', '-b', 'main']);
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    git(['add', 'a.txt']);
    git(['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-m', 'chore: init']);
    expect(shapeProblems(git)).toEqual([]);
    git(['tag', 'v1']);
    git(['branch', 'topic']);
    git(['remote', 'add', 'origin', 'https://example.invalid/x.git']);
    expect(shapeProblems(git)).toEqual([
      '2 refs besides main (refs/heads/topic, refs/tags/v1 …)',
      'a remote is configured',
    ]);
  });
});
