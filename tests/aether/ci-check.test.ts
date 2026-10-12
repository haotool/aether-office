import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const { ciProblems, workflowProblems } = await import(
  pathToFileURL(resolve('scripts/oss/ci-check.mjs')).href
);

const PIN = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4';
const OK = `name: x
on: push
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: ${PIN}
      - run: pnpm audit:gate
`;

describe('workflowProblems', () => {
  it('accepts pinned actions, read-only permissions and no failing-step escape', () => {
    expect(workflowProblems('ok.yml', OK)).toEqual([]);
  });

  it('flags an action pinned to a tag, a write permission and pull_request_target', () => {
    const bad = OK.replace(/@[0-9a-f]{40}/, '@v4')
      .replace('contents: read', 'contents: write')
      .replace('on: push', 'on: pull_request_target');
    expect(workflowProblems('bad.yml', bad)).toEqual([
      expect.stringContaining('bad.yml:2: runs on pull_request_target'),
      expect.stringContaining('not pinned to a commit SHA (actions/checkout@v4)'),
      expect.stringContaining('top-level permissions grant write'),
    ]);
  });

  it('wants top-level permissions unless every job sets its own', () => {
    const noTop = OK.replace('permissions:\n  contents: read\n', '');
    expect(workflowProblems('a.yml', noTop)).toEqual([expect.stringContaining('no top-level')]);
    const perJob = noTop.replace(
      '    runs-on',
      '    permissions:\n      contents: read\n    runs-on',
    );
    expect(workflowProblems('b.yml', perJob)).toEqual([]);
  });

  it('flags continue-on-error: true but not a comment about it', () => {
    expect(workflowProblems('c.yml', `${OK}      continue-on-error: true\n`)).toHaveLength(1);
    expect(workflowProblems('d.yml', `${OK}      # continue-on-error: true\n`)).toEqual([]);
  });
});

describe('ciProblems', () => {
  const root = mkdtempSync(join(tmpdir(), 'aether-ci-check-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(join(root, '.github/workflows/ci.yml'), OK);

  it('wants a CodeQL workflow beside the audit step', () => {
    expect(ciProblems(root)).toEqual(['no workflow runs CodeQL (github/codeql-action/analyze)']);
    writeFileSync(
      join(root, '.github/workflows/codeql.yml'),
      OK.replace('pnpm audit:gate', '').replace(
        PIN,
        'github/codeql-action/analyze@' + 'a'.repeat(40),
      ),
    );
    expect(ciProblems(root)).toEqual([]);
  });

  it('is clean for this repository', () => {
    expect(ciProblems(resolve('.'))).toEqual([]);
  });
});
