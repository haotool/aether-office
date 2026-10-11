import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { renderReport, validateLedger, type Feature } from '../../scripts/verification-ledger.js';

const f = (
  id: string,
  impl: Feature['implementationStatus'],
  ver: Feature['verificationStatus'],
  blockers: string[] = [],
): Feature => ({
  id,
  requirement: `req ${id} | with pipe`,
  implementationStatus: impl,
  verificationStatus: ver,
  testIds: [],
  blockers,
});

it('keeps implementation and verification separate and shows blockers for anything not passed', () => {
  const report = renderReport(
    [
      f('A', 'implemented', 'passed'),
      f('B', 'partial', 'partial', ['needs a GPU']),
      f('C', 'partial', 'blocked', ['paid session']),
      f('D', 'not_started', 'not_run'),
      f('E', 'implemented', 'failed', ['red test']),
    ],
    'test',
  );
  expect(report).toContain(
    'Features: **5**. Implementation: 2 implemented, 2 partial, 1 not started.',
  );
  for (const status of ['passed', 'partial', 'blocked', 'failed', 'not_run'])
    expect(report).toContain(`## ${status} (1)`);
  expect(report).toContain('needs a GPU');
  expect(report).toContain('req A \\| with pipe');
  expect(report).toContain('not a claim of production readiness');
});

it('docs/verification/report.md matches the current feature ledger', () => {
  const raw = JSON.parse(readFileSync('docs/verification/features.json', 'utf8')) as
    Feature[] | { features: Feature[] };
  const expected = renderReport(
    Array.isArray(raw) ? raw : raw.features,
    'docs/verification/features.json',
  );
  expect(readFileSync('docs/verification/report.md', 'utf8')).toBe(expected);
});

it('the ledger points only at real files and every pass names its checks', () => {
  const raw = JSON.parse(readFileSync('docs/verification/features.json', 'utf8')) as
    Feature[] | { features: Feature[] };
  expect(validateLedger(Array.isArray(raw) ? raw : raw.features, existsSync)).toEqual([]);
});

it('rejects a pass without tests, dangling paths, duplicate ids and verified-but-unbuilt rows', () => {
  const bad = [
    { ...f('A', 'implemented', 'passed'), codePaths: ['nope.ts'] },
    { ...f('A', 'not_started', 'passed'), testIds: ['missing.test.ts'], codePaths: [] },
  ];
  const problems = validateLedger(bad, () => false);
  expect(problems.join('\n')).toMatch(/duplicate id/);
  expect(problems.join('\n')).toMatch(/code path missing: nope.ts/);
  expect(problems.join('\n')).toMatch(/passed without any test/);
  expect(problems.join('\n')).toMatch(/verified but not implemented/);
});

it('rejects a blocker text that is pasted into a second row', () => {
  const problems = validateLedger(
    [
      { ...f('A', 'partial', 'partial', ['same gap']), codePaths: ['a.ts'] },
      { ...f('B', 'partial', 'partial', ['same gap']), codePaths: ['b.ts'] },
    ],
    () => true,
  );
  expect(problems).toEqual(['B: blocker copied from A']);
});
