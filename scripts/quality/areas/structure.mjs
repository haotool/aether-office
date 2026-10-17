import { findDuplicates } from '../dup.mjs';
import { deadExports, fanIn, findCycles } from '../graph.mjs';
import { SELF, at, fanInExcludedTarget, isSourceFile, locations, scan, top } from '../lib.mjs';
import { rule } from '../model.mjs';
import { CODE_FILE, PRODUCT_SOURCE, lineCount, matching } from '../repo.mjs';

export const LIMITS = {
  fileSoft: 400,
  fileHard: 800,
  functionLines: 50,
  nesting: 4,
  fanIn: 30,
  duplicateShare: 3,
  codeLines: 146519,
};

const isEntry = (file) => /\/main\.tsx?$/.test(file);

export function structure(repo, { facts, graph }) {
  const source = facts.filter((f) => isSourceFile(f.file));
  const code = repo.files.filter((f) => CODE_FILE.test(f) && !SELF.test(f));
  const sizes = code.map((file) => ({ file, lines: lineCount(repo.read(file)) }));
  const big = (min, max) =>
    sizes.filter((s) => s.lines > min && s.lines <= max).sort((a, b) => b.lines - a.lines);
  const soft = big(LIMITS.fileSoft, LIMITS.fileHard);
  const hard = big(LIMITS.fileHard, Infinity);
  const fileLine = (s) => at(s.file, 1, `${s.lines} lines`);
  const functions = source.flatMap((f) => f.functions.map((fn) => ({ ...fn, file: f.file })));
  const long = functions
    .filter((fn) => fn.length > LIMITS.functionLines)
    .sort((a, b) => b.length - a.length);
  const deep = functions
    .filter((fn) => fn.nesting > LIMITS.nesting)
    .sort((a, b) => b.nesting - a.nesting);
  const cycles = findCycles(new Map([...graph.runtime].filter(([f]) => PRODUCT_SOURCE.test(f))));
  const importers = [...fanIn(graph.runtime, (f) => !SELF.test(f))].filter(
    ([file, n]) => n > LIMITS.fanIn && !/\/index\.tsx?$/.test(file) && !fanInExcludedTarget(file),
  );
  const dead = deadExports(
    facts.filter((f) => PRODUCT_SOURCE.test(f.file)),
    graph.uses,
    { isEntry },
  );
  const sources = matching(repo, PRODUCT_SOURCE).map((file) => ({ file, text: repo.read(file) }));
  const dup = findDuplicates(sources);
  const share = dup.totalLines === 0 ? 0 : (dup.duplicatedLines / dup.totalLines) * 100;
  const todo = scan(repo, code, /(?:\/\/|\/\*|^\s*\*).*\b(?:TODO|FIXME|HACK)\b/);
  const suppress = scan(repo, code, /@ts-(?:ignore|nocheck|expect-error)|eslint-disable/);
  const consoleUse = scan(
    repo,
    matching(repo, PRODUCT_SOURCE),
    /^(?!\s*(?:\/\/|\*)).*\bconsole\.(?:log|info|warn|error|debug|trace)\s*\(/,
  );
  return [
    rule({
      id: 'file-size-400',
      label: `Files over ${LIMITS.fileSoft} lines`,
      weight: 8,
      value: soft.length,
      full: 25,
      details: top(soft.map(fileLine)),
    }),
    rule({
      id: 'file-size-800',
      label: `Files over ${LIMITS.fileHard} lines`,
      weight: 12,
      value: hard.length,
      full: 4,
      details: hard.map(fileLine),
    }),
    rule({
      id: 'function-length',
      label: `Functions over ${LIMITS.functionLines} lines`,
      weight: 12,
      value: long.length,
      full: 120,
      details: top(long.map((fn) => at(fn.file, fn.line, `${fn.name} ${fn.length} lines`))),
    }),
    rule({
      id: 'nesting',
      label: `Control-flow nesting deeper than ${LIMITS.nesting}`,
      weight: 8,
      value: deep.length,
      full: 20,
      details: top(deep.map((fn) => at(fn.file, fn.line, `${fn.name} depth ${fn.nesting}`))),
    }),
    rule({
      id: 'import-cycles',
      label: 'Import cycles (runtime imports, product source)',
      weight: 12,
      value: cycles.length,
      full: 3,
      details: cycles.map((c) => c.join(' <-> ')),
    }),
    rule({
      id: 'fan-in',
      label: `Files imported by more than ${LIMITS.fanIn} others`,
      weight: 5,
      value: importers.length,
      full: 3,
      details: importers.map(([file, n]) => at(file, 1, `${n} importers`)),
    }),
    rule({
      id: 'dead-exports',
      label: 'Exports nothing imports',
      weight: 10,
      value: dead.length,
      full: 80,
      details: top(dead.map((d) => at(d.file, d.line, d.name))),
    }),
    rule({
      id: 'code-lines',
      label: `Code lines over the budget of ${LIMITS.codeLines}`,
      weight: 6,
      value: Math.max(0, sizes.reduce((n, s) => n + s.lines, 0) - LIMITS.codeLines),
      full: 50,
    }),
    rule({
      id: 'duplicates',
      label: `Duplicated code share (limit ${LIMITS.duplicateShare}%)`,
      weight: 12,
      value: share,
      limit: LIMITS.duplicateShare,
      full: 9,
      unit: '%',
      details: top(
        dup.clusters
          .slice(0, 12)
          .map(
            (c) =>
              `${c.lines} lines x${c.copies.length}: ${c.copies.map((x) => at(x.file, x.from)).join(' = ')}`,
          ),
      ),
    }),
    rule({
      id: 'any-type',
      label: 'Uses of the any type (product source)',
      weight: 6,
      value: source.reduce((n, f) => n + f.any.length, 0),
      full: 40,
      details: top(locations(source, 'any')),
    }),
    rule({
      id: 'suppressions',
      label: 'Type or lint suppression comments',
      weight: 6,
      value: suppress.length,
      full: 10,
      details: top(suppress),
    }),
    rule({
      id: 'todo-markers',
      label: 'Unfinished-work markers in comments',
      weight: 5,
      value: todo.length,
      full: 10,
      details: top(todo),
    }),
    rule({
      id: 'console-output',
      label: 'console.* in product source',
      weight: 5,
      value: consoleUse.length,
      full: 20,
      details: top(consoleUse),
    }),
  ];
}
