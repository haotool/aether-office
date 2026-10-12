#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { SCHEMA } from './gates-evidence.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/** @type {Record<string, { argv: string[] }>} */
export const GATE_COMMANDS = {
  'L1-01': { argv: ['pnpm', 'typecheck'] },
  'L1-07': { argv: ['node', 'scripts/quality/release/gate-l1-07.mjs'] },
  'L2-01': { argv: ['pnpm', 'lint'] },
  'L2-07': { argv: ['node', 'scripts/check-boundaries.mjs'] },
  'L3-01': { argv: ['pnpm', 'test'] },
  'L3-02': { argv: ['pnpm', 'exec', 'playwright', 'test'] },
  'L3-04': { argv: ['pnpm', 'run', 'verification:check'] },
  'L3-07': { argv: ['node', 'scripts/clean-room.mjs'] },
  'L4-01': { argv: ['node', 'scripts/ux-matrix-summary.mjs', '--check', 'qa'] },
  'L4-02': { argv: ['node', 'scripts/ux-matrix-summary.mjs', '--check', 'axe'] },
  'L4-04': { argv: ['node', 'scripts/ux-matrix-summary.mjs', '--check', 'responsive'] },
  'L5-01': { argv: ['pnpm', 'run', 'quality:check'] },
  'L6-01': { argv: ['node', 'scripts/quality/score.mjs', '--check'] },
  'L7-01': { argv: ['node', 'scripts/quality/release/gate-l7-01.mjs'] },
  'L7-02': { argv: ['pnpm', 'run', 'oss:check'] },
  'L7-05': { argv: ['node', 'scripts/clean-room.mjs', '--e2e'] },
  'L8-01': { argv: ['node', 'scripts/oss/history-gate.mjs', 'L8-01'] },
  'L8-02': { argv: ['node', 'scripts/oss/history-gate.mjs', 'L8-02'] },
  'L8-04': { argv: ['node', 'scripts/oss/history-gate.mjs', 'L8-04'] },
  'L8-08': { argv: ['node', 'scripts/oss/history-gate.mjs', 'L8-08'] },
  'L9-01': { argv: ['pnpm', 'run', 'oss:check'] },
  'L9-02': { argv: ['pnpm', 'run', 'oss:check'] },
  'L9-03': { argv: ['node', 'scripts/oss/ci-check.mjs'] },
  'L9-05': { argv: ['node', 'scripts/oss/ci-check.mjs'] },
};

function headSha() {
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function dirtyCount() {
  return execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean).length;
}

function runGate(id, spec) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const result = spawnSync(spec.argv[0], spec.argv.slice(1), {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = result.status ?? (result.error ? 127 : 1);
  return {
    id,
    exit,
    command: spec.argv.join(' '),
    startedAt,
    durationMs: Date.now() - t0,
  };
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      out: { type: 'string' },
      only: { type: 'string' },
    },
  });
  if (!values.out) {
    console.error('usage: quality:gates -- --out <file> [--only id,id]');
    process.exit(2);
  }
  const only = values.only
    ? values.only
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : Object.keys(GATE_COMMANDS);
  const unknown = only.filter((id) => !GATE_COMMANDS[id]);
  if (unknown.length) {
    console.error(`unknown gate id(s): ${unknown.join(', ')}`);
    process.exit(2);
  }
  const gates = only.map((id) => runGate(id, GATE_COMMANDS[id]));
  const doc = {
    schema: SCHEMA,
    sha: headSha(),
    dirty: dirtyCount(),
    gates,
  };
  const outPath = path.resolve(root, values.out);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${values.out} (${gates.length} gates)`);
  if (gates.some((g) => g.exit !== 0)) process.exitCode = 1;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
