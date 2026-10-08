#!/usr/bin/env node
// Objective quality scorecard (see docs/quality/README.md).
//
//   node scripts/quality/score.mjs [--area <name>]... [--json] [--target <n>] [--details <n>]   print the scores
//   node scripts/quality/score.mjs --report        write docs/quality/scorecard.{md,json} and raise the floors
//   node scripts/quality/score.mjs --check         fail on a stale scorecard or an area below its floor
//   node scripts/quality/score.mjs --release       CHARTER §5 release score (unmeasured = 0)
//
// Local only: no network, no browser, no new dependency. Run `pnpm build` first to include the bundle budgets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { floorProblems, parseFloors, raiseFloors, serializeFloors, staleness } from './floors.mjs';
import { renderMarkdown, renderTable } from './render.mjs';
import { renderReleaseTable } from './release/render.mjs';
import { scoreRelease } from './release/run.mjs';
import { scoreRepository } from './run.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DIR = path.join(root, 'docs/quality');
const files = {
  markdown: path.join(DIR, 'scorecard.md'),
  json: path.join(DIR, 'scorecard.json'),
  floors: path.join(DIR, 'floors.json'),
};
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

function check(fresh, floors) {
  const failures = [];
  const committed = read(files.json);
  if (!committed)
    failures.push('docs/quality/scorecard.json is missing: run pnpm run quality:report');
  else {
    const old = JSON.parse(committed);
    failures.push(...staleness(old, fresh).map((d) => `stale scorecard: ${d}`));
    if (read(files.markdown) !== renderMarkdown(old, floors))
      failures.push(
        'docs/quality/scorecard.md does not match scorecard.json: run pnpm run quality:report',
      );
  }
  failures.push(...floorProblems(fresh, floors));
  return failures;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      area: { type: 'string', multiple: true, default: [] },
      json: { type: 'boolean', default: false },
      report: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      release: { type: 'boolean', default: false },
      out: { type: 'string' },
      target: { type: 'string' },
      details: { type: 'string', default: '5' },
    },
  });
  if (values.release) {
    if (values.report || values.check || values.json)
      throw new Error('--release cannot be combined with --report, --check, or --json');
    const report = await scoreRelease(root);
    const table = renderReleaseTable(report);
    if (values.out) {
      const outPath = path.resolve(root, values.out);
      try {
        mkdirSync(path.dirname(outPath), { recursive: true });
        writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
        const msg =
          code === 'EEXIST' || code === 'EACCES' || code === 'EROFS'
            ? `cannot write release report to ${values.out}: ${code}`
            : `cannot write release report to ${values.out}: ${err instanceof Error ? err.message : err}`;
        console.error(msg);
        process.exitCode = 2;
        return;
      }
    }
    if (report.evidenceError) console.error(report.evidenceError);
    console.log(table);
    if (!report.pass) process.exitCode = 1;
    return;
  }
  if ((values.report || values.check) && values.area.length)
    throw new Error('--report and --check always cover every area: drop --area');
  const floors = parseFloors(read(files.floors));
  const report = await scoreRepository(root, values.area);
  if (values.report) {
    writeFileSync(files.json, `${JSON.stringify(report, null, 2)}\n`);
    const raised = raiseFloors(floors, report);
    writeFileSync(files.floors, serializeFloors(raised));
    writeFileSync(files.markdown, renderMarkdown(report, raised));
    console.log(renderTable(report, raised, { brief: true }));
    return;
  }
  if (values.check) {
    const failures = check(report, floors);
    if (failures.length) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
    } else
      console.log(
        `quality: scorecard is current; every area is at or above its floor (overall ${report.overall})`,
      );
    return;
  }
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    const target = values.target === undefined ? undefined : Number(values.target);
    console.log(renderTable(report, floors, { target, details: Number(values.details) }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
