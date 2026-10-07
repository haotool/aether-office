// Area 3: tests. How much of the product source the unit tests import (directly and through the import graph), flaky
// patterns, skipped tests, and line/branch coverage when a vitest coverage run left a summary behind.
import { reachableFrom } from '../graph.mjs';
import { SELF, scan, top } from '../lib.mjs';
import { info, rule, skipped } from '../model.mjs';
import { PRODUCT_SOURCE, lineCount } from '../repo.mjs';

const UNIT_TEST = /^tests\/aether\/.*\.test\.tsx?$/;
const TEST_CODE = /^(tests|e2e)\/.*\.(ts|tsx)$/;
const COVERAGE_SUMMARY = 'coverage/coverage-summary.json';
// A unit test that binds a literal port can collide with another run; an origin string handed to `inject` binds nothing.
export const FLAKY = [
  {
    name: 'fixed sleep',
    where: TEST_CODE,
    pattern:
      /\bsetTimeout\(\s*(?:\w+|\(\)\s*=>\s*\w+)\s*,\s*\d{3,}\s*\)|\bsleep\(\s*\d{3,}\s*\)|\bwaitForTimeout\(/,
  },
  {
    name: 'fixed port',
    where: /^tests\//,
    pattern: /\.listen\(\s*(?:\{\s*port:\s*)?\d{4}\b|\bport:\s*\d{4}\b/,
  },
  {
    name: 'fixed port',
    where: /^(e2e\/|playwright\.config\.ts)/,
    pattern: /(?:127\.0\.0\.1|localhost):\d{4}\b/,
  },
];
// `test.skip(condition, reason)` is a runtime guard (for example a GPU-only run), not a disabled test.
const SKIPPED =
  /\b(?:it|test|describe)\.(?:skip\(\s*(?:['"`]|\)|\w+\s*,\s*(?:async|\())|todo\(|fixme\()|\bxit\(|\bxdescribe\(/;

/**
 * Modules a unit test imports by name, following re-exports through barrels (`index.ts`) to the module that defines the
 * name. A namespace import credits every module the barrel re-exports.
 */
export function directlyImported(uses, fromTest) {
  const reexports = new Map();
  for (const u of uses.filter((x) => x.reexport))
    reexports.set(u.from, [...(reexports.get(u.from) ?? []), u]);
  const found = new Set();
  const credit = (file, name, seen = new Set()) => {
    const key = `${file}\0${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.add(file);
    for (const u of reexports.get(file) ?? [])
      if (name === null || u.namespace || u.names.includes(name)) credit(u.target, name, seen);
  };
  for (const u of uses.filter((x) => !x.reexport && fromTest(x.from))) {
    if (u.namespace || u.names.length === 0) credit(u.target, null);
    else for (const name of u.names) credit(u.target, name);
  }
  return found;
}

/** Product modules the unit tests import directly, and those reachable from them. */
export function testedModules(facts, graph) {
  const product = facts
    .map((f) => f.file)
    .filter((f) => PRODUCT_SOURCE.test(f) && !f.endsWith('.d.ts'));
  const testFiles = facts.map((f) => f.file).filter((f) => UNIT_TEST.test(f));
  const direct = directlyImported(graph.uses, (f) => UNIT_TEST.test(f));
  const reached = reachableFrom(testFiles, graph.uses);
  return { product, direct, reached };
}

const packageOf = (file) => file.split('/').slice(0, 2).join('/');

function coverageRules(repo) {
  if (!repo.exists(COVERAGE_SUMMARY))
    return [
      skipped(
        'coverage',
        'Line and branch coverage (vitest v8 provider)',
        15,
        `no ${COVERAGE_SUMMARY}: @vitest/coverage-v8 is not installed and no coverage run was recorded`,
      ),
    ];
  const total = JSON.parse(repo.read(COVERAGE_SUMMARY)).total;
  return [
    rule({
      id: 'coverage-lines',
      label: 'Line coverage',
      weight: 8,
      value: total.lines.pct,
      atLeast: 80,
      full: 40,
      unit: '%',
    }),
    rule({
      id: 'coverage-branches',
      label: 'Branch coverage',
      weight: 7,
      value: total.branches.pct,
      atLeast: 70,
      full: 40,
      unit: '%',
    }),
  ];
}

export function tests(repo, { facts, graph }) {
  const { product, direct, reached } = testedModules(facts, graph);
  const unreached = product.filter((f) => !reached.has(f) && !/\/main\.tsx?$/.test(f));
  const undirect = product.filter((f) => !direct.has(f));
  const packages = [...new Set(product.map(packageOf))].sort();
  const perPackage = packages.map((p) => {
    const files = product.filter((f) => packageOf(f) === p);
    const covered = files.filter((f) => direct.has(f)).length;
    const lines = files.reduce((n, f) => n + lineCount(repo.read(f)), 0);
    return { p, files: files.length, covered, lines };
  });
  const testLines = repo.files
    .filter((f) => UNIT_TEST.test(f))
    .reduce((n, f) => n + lineCount(repo.read(f)), 0);
  const productLines = perPackage.reduce((n, p) => n + p.lines, 0);
  const testFiles = repo.files.filter((f) => TEST_CODE.test(f) && !SELF.test(f));
  const flaky = FLAKY.flatMap(({ name, where, pattern }) =>
    scan(
      repo,
      repo.files.filter((f) => where.test(f)),
      pattern,
      { say: () => name },
    ),
  );
  const skips = scan(repo, testFiles, SKIPPED);
  const directShare =
    product.length === 0
      ? 100
      : (direct.size === 0 ? 0 : (product.length - undirect.length) / product.length) * 100;
  return [
    rule({
      id: 'unreached-modules',
      label: 'Product modules no unit test reaches through imports',
      weight: 25,
      value: unreached.length,
      full: 60,
      details: top(unreached),
    }),
    rule({
      id: 'direct-tests',
      label: 'Share of product modules a unit test imports directly',
      weight: 15,
      value: directShare,
      atLeast: 60,
      full: 40,
      unit: '%',
      details: top(
        perPackage.map((p) => `${p.p}: ${p.covered}/${p.files} modules, ${p.lines} source lines`),
      ),
    }),
    rule({
      id: 'flaky-patterns',
      label: 'Fixed sleeps, fixed ports and waitForTimeout in tests',
      weight: 20,
      value: flaky.length,
      full: 60,
      details: top(flaky),
    }),
    rule({
      id: 'skipped-tests',
      label: 'Skipped or todo tests',
      weight: 10,
      value: skips.length,
      full: 5,
      details: top(skips),
    }),
    ...coverageRules(repo),
    info(
      'test-ratio',
      'Unit-test lines per product source line',
      Number((testLines / Math.max(productLines, 1)).toFixed(2)),
      perPackage.map((p) => `${p.p}: ${p.lines} source lines`),
    ),
  ];
}
