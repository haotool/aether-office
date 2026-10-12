#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { codeTrees } from '../ux-matrix-summary.mjs';

export const SCHEMA = 'aether-perf-mobile/1';
export const RECORD = 'docs/verification/perf-mobile.json';

export function readRecord(root) {
  const file = path.join(root, RECORD);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function writeRecord(root, raw) {
  const record = {
    schema: SCHEMA,
    measuredAt: new Date().toISOString(),
    ...raw,
    trees: codeTrees(root),
  };
  writeFileSync(path.join(root, RECORD), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: { write: { type: 'string' } },
  });
  if (!values.write) {
    console.error('usage: pnpm run perf:record -- --write <raw.json>');
    process.exit(64);
  }
  writeRecord(root, JSON.parse(readFileSync(values.write, 'utf8')));
  console.log(`wrote ${RECORD}`);
}
