#!/usr/bin/env node
// With --write the totals go to docs/verification/ux-matrix.json beside the tree ids of the code they describe, so a
// later change to that code shows the record is stale.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const SCHEMA = 'aether-ux-matrix/1';
export const RECORD = 'docs/verification/ux-matrix.json';
export const CODE_PATHS = [
  'apps/web',
  'apps/control',
  'packages/contracts',
  'packages/kernel',
  'packages/office-scene',
];
const COMBINATIONS = { core: 28, states: 4 };
const SIGNED_OUT_401 = /401 \(Unauthorized\)/;

const isState = (cell) => cell.scene.startsWith('state-');
const unexpected = (cell) =>
  cell.expectsErrors
    ? []
    : cell.errors.filter((e) => !(cell.scene.startsWith('login') && SIGNED_OUT_401.test(e)));

/** @param {{ scene: string, viewport: string, theme: string, lang: string, overflowPx: number, blank: boolean, smallTargets: string[], axe: unknown[], errors: string[], expectsErrors?: boolean }[]} cells @param {number} combinations */
function part(cells, combinations) {
  const perCombination = new Map();
  for (const c of cells) {
    const key = `${c.viewport} ${c.theme} ${c.lang}`;
    perCombination.set(key, (perCombination.get(key) ?? 0) + 1);
  }
  const sizes = new Set(perCombination.values());
  return {
    cells: cells.length,
    combinations: perCombination.size,
    complete: perCombination.size === combinations && sizes.size === 1,
    overflow: cells.filter((c) => c.overflowPx > 1).length,
    blank: cells.filter((c) => c.blank && !isState(c)).length,
    axeSerious: cells.filter((c) => c.axe.length).length,
    unexpectedErrors: cells.filter((c) => unexpected(c).length).length,
    smallTargets: cells.filter((c) => c.smallTargets.length).length,
  };
}

export function summarize(cells) {
  return {
    core: part(
      cells.filter((c) => !isState(c)),
      COMBINATIONS.core,
    ),
    states: part(cells.filter(isState), COMBINATIONS.states),
  };
}

export function readCells(dir) {
  return readdirSync(dir)
    .filter((f) => f.startsWith('index-') && f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

export function codeTrees(root) {
  return Object.fromEntries(
    CODE_PATHS.map((p) => [
      p,
      execFileSync('git', ['-C', root, 'rev-parse', `HEAD:${p}`], { encoding: 'utf8' }).trim(),
    ]),
  );
}

export function readRecord(root) {
  const file = path.join(root, RECORD);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

const parts = (record) => [
  ['core', record.core],
  ['states', record.states],
];
const incomplete = (record) =>
  parts(record)
    .filter(([, part]) => !part.complete)
    .map(([name]) => `${name} matrix incomplete`);
const nonzero = (record, keys) =>
  parts(record).flatMap(([name, part]) =>
    keys.filter((key) => part[key] > 0).map((key) => `${name}: ${part[key]} cells with ${key}`),
  );

export const RULES = {
  qa: (record) => [
    ...incomplete(record),
    ...nonzero(record, ['overflow', 'blank', 'unexpectedErrors']),
  ],
  axe: (record) => [...incomplete(record), ...nonzero(record, ['axeSerious'])],
  responsive: (record) => [...incomplete(record), ...nonzero(record, ['overflow'])],
};

export const staleTrees = (record, trees) =>
  CODE_PATHS.filter((p) => record.trees?.[p] !== trees[p]);

export function problems(record, trees, rule) {
  if (!record) return [`no ${RECORD}: run pnpm run ux:matrix, then pnpm run ux:summary -- --write`];
  const stale = staleTrees(record, trees);
  return [
    ...(stale.length ? [`record is stale for ${stale.join(', ')}`] : []),
    ...RULES[rule](record),
  ];
}

function main() {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: { dir: { type: 'string' }, write: { type: 'boolean' }, check: { type: 'string' } },
  });
  if (values.check) {
    const found = problems(readRecord(root), codeTrees(root), values.check);
    for (const line of found) console.error(line);
    process.exitCode = found.length ? 1 : 0;
    return;
  }
  const dir = values.dir ?? process.env['UX_OUT'] ?? 'evidence/ux';
  const totals = summarize(readCells(dir));
  console.log(JSON.stringify(totals, null, 2));
  if (!values.write) return;
  const record = { schema: SCHEMA, trees: codeTrees(root), ...totals };
  writeFileSync(path.join(root, RECORD), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`wrote ${RECORD}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
