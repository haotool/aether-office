#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const SCHEMA = 'aether-stability/1';
export const RECORD = 'docs/verification/stability.json';
const STAMPED = ['apps', 'packages', 'tests', 'vitest.config.ts'];
const REGENERATE = 'regenerate with: node scripts/quality/release/stability.mjs';
const LISTED = 20;

const treeIds = (root) =>
  Object.fromEntries(
    STAMPED.map((p) => [
      p,
      execFileSync('git', ['-C', root, 'rev-parse', `HEAD:${p}`], { encoding: 'utf8' }).trim(),
    ]),
  );

export function statuses(report, root) {
  const byTest = new Map();
  for (const file of report.testResults)
    for (const test of file.assertionResults)
      byTest.set(`${path.relative(root, file.name)} :: ${test.fullName}`, test.status);
  return byTest;
}

export function inconsistent(runs) {
  const names = new Set(runs.flatMap((run) => [...run.keys()]));
  return [...names].filter(
    (name) => new Set(runs.map((run) => run.get(name) ?? 'missing')).size > 1,
  );
}

/** @param {string} root */
export function measureStability(root) {
  const file = path.join(root, RECORD);
  if (!existsSync(file)) return { unmeasured: true, detail: [`missing ${RECORD}`, REGENERATE] };
  const record = JSON.parse(readFileSync(file, 'utf8'));
  const now = treeIds(root);
  const stale = STAMPED.filter((p) => record.trees?.[p] !== now[p]);
  if (stale.length)
    return { unmeasured: true, detail: [`${RECORD} is stale for ${stale.join(', ')}`, REGENERATE] };
  if (record.runs < 3)
    return { unmeasured: true, detail: [`${record.runs} run(s) recorded; three are needed`] };
  return {
    violations: record.inconsistent.length,
    value: record.inconsistent.length,
    detail: record.inconsistent.slice(0, LISTED),
  };
}

function runSuite(root, scratch, n) {
  const report = path.join(scratch, `run-${n}.json`);
  const sessions = mkdtempSync(path.join(scratch, 'sessions-'));
  spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${report}`], {
    cwd: root,
    env: { ...process.env, AETHER_LOCAL_SESSIONS_HOME: sessions },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return statuses(JSON.parse(readFileSync(report, 'utf8')), root);
}

function main() {
  const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: { runs: { type: 'string', default: '3' } },
  });
  const runCount = Number(values.runs);
  const scratch = mkdtempSync(path.join(tmpdir(), 'aether-stability-'));
  try {
    const runs = Array.from({ length: runCount }, (_, n) => runSuite(root, scratch, n));
    const tally = (run, status) => [...run.values()].filter((s) => s === status).length;
    const record = {
      schema: SCHEMA,
      measuredAt: new Date().toISOString(),
      runs: runCount,
      tests: new Set(runs.flatMap((run) => [...run.keys()])).size,
      perRun: runs.map((run) => ({
        passed: tally(run, 'passed'),
        failed: tally(run, 'failed'),
        skipped: tally(run, 'skipped') + tally(run, 'pending'),
      })),
      inconsistent: inconsistent(runs),
      trees: treeIds(root),
    };
    writeFileSync(path.join(root, RECORD), `${JSON.stringify(record, null, 2)}\n`);
    console.log(
      `${record.tests} tests, ${runCount} runs, ${record.inconsistent.length} inconsistent; wrote ${RECORD}`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
