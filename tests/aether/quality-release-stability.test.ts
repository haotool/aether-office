import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const { inconsistent, measureStability, statuses } = await import(
  pathToFileURL(resolve('scripts/quality/release/stability.mjs')).href
);

const root = mkdtempSync(join(tmpdir(), 'aether-stability-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
const commit = (message: string) => {
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-m', message);
};
const record = (extra: object) => {
  const trees = Object.fromEntries(
    ['apps', 'packages', 'tests', 'vitest.config.ts'].map((p) => [
      p,
      execFileSync('git', ['-C', root, 'rev-parse', `HEAD:${p}`], { encoding: 'utf8' }).trim(),
    ]),
  );
  writeFileSync(
    join(root, 'docs/verification/stability.json'),
    JSON.stringify({ runs: 3, inconsistent: [], trees, ...extra }),
  );
};

describe('the stability of the test suite', () => {
  it('reads a run from the vitest JSON report', () => {
    const run = statuses(
      {
        testResults: [
          {
            name: `${root}/tests/a.test.ts`,
            assertionResults: [{ fullName: 'a b', status: 'passed' }],
          },
        ],
      },
      root,
    );
    expect([...run]).toEqual([['tests/a.test.ts :: a b', 'passed']]);
  });

  it('lists the tests whose status changes between runs, or that are missing from one', () => {
    const runs = [
      new Map([
        ['x', 'passed'],
        ['y', 'passed'],
        ['z', 'passed'],
      ]),
      new Map([
        ['x', 'passed'],
        ['y', 'failed'],
        ['z', 'passed'],
      ]),
      new Map([
        ['x', 'passed'],
        ['y', 'passed'],
      ]),
    ];
    expect(inconsistent(runs)).toEqual(['y', 'z']);
  });

  it('is unmeasured while the record is missing, short of runs or stale', () => {
    git('init', '-b', 'main');
    for (const p of ['apps', 'packages', 'tests']) {
      mkdirSync(join(root, p), { recursive: true });
      writeFileSync(join(root, p, 'index.ts'), 'export {};\n');
    }
    writeFileSync(join(root, 'vitest.config.ts'), 'export default {};\n');
    mkdirSync(join(root, 'docs/verification'), { recursive: true });
    commit('chore: code');
    expect(measureStability(root)).toMatchObject({ unmeasured: true });
    record({ runs: 2 });
    expect(measureStability(root)).toMatchObject({ unmeasured: true });
    record({});
    writeFileSync(join(root, 'tests/index.ts'), 'export const changed = 1;\n');
    commit('test: change a test');
    expect(measureStability(root)).toMatchObject({
      unmeasured: true,
      detail: [expect.stringContaining('stale for tests'), expect.any(String)],
    });
  });

  it('charges one violation per test that is not stable', () => {
    record({ inconsistent: ['tests/a.test.ts :: flips'] });
    expect(measureStability(root)).toMatchObject({ violations: 1 });
    record({});
    expect(measureStability(root)).toMatchObject({ violations: 0 });
  });
});
