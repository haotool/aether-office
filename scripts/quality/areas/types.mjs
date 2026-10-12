import path from 'node:path';
import { isSourceFile, locations, top } from '../lib.mjs';
import { rule } from '../model.mjs';
import { runCommand } from '../repo.mjs';

export const REQUIRED_FLAGS = ['strict', 'noUncheckedIndexedAccess', 'noUnusedLocals'];
export const RECOMMENDED_FLAGS = [
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noImplicitOverride',
  'noUnusedParameters',
];
const TS_FILE = /^(apps|packages|scripts|tests|e2e)\/.*\.(ts|tsx)$/;

export const missingFlags = (options, flags) => flags.filter((flag) => options[flag] !== true);

/** Lines a gate printed that name a problem; the gate's own exit status decides pass or fail. */
export function gate(root, command, args, pick) {
  const run = runCommand(command, args, { cwd: root, timeout: 240_000 });
  if (run.error) return { ran: false, findings: [`${command} could not run (${run.error})`] };
  const findings = run.status === 0 ? [] : run.output.split('\n').filter(pick);
  return {
    ran: true,
    findings: run.status !== 0 && findings.length === 0 ? ['exit status ' + run.status] : findings,
  };
}

export function types(repo, { facts, compilerOptions, programFiles }) {
  const root = repo.root;
  const source = facts.filter((f) => isSourceFile(f.file));
  const inProgram = new Set(programFiles);
  const untyped = repo.files.filter((f) => TS_FILE.test(f) && !inProgram.has(f));
  const required = missingFlags(compilerOptions, REQUIRED_FLAGS);
  const recommended = missingFlags(compilerOptions, RECOMMENDED_FLAGS);
  const tsc = gate(
    root,
    process.execPath,
    [path.join(root, 'node_modules/typescript/lib/tsc.js'), '--noEmit', '-p', 'tsconfig.json'],
    (l) => /error TS\d+/.test(l),
  );
  const bounds = gate(
    root,
    process.execPath,
    ['scripts/check-boundaries.mjs'],
    (l) => l.trim() !== '',
  );
  const pretty = gate(
    root,
    process.execPath,
    [path.join(root, 'node_modules/prettier/bin/prettier.cjs'), '--check', '.'],
    (l) => l.startsWith('[warn]') && !l.includes('Code style issues'),
  );
  const nonNull = source.reduce((n, f) => n + f.nonNull.length, 0);
  const casts = source.reduce((n, f) => n + f.unknownCasts.length, 0);
  return [
    rule({
      id: 'strict-flags',
      label: `Required compiler flags (${REQUIRED_FLAGS.join(', ')})`,
      weight: 20,
      value: required.length,
      full: 1,
      details: required.map((f) => `tsconfig.json: ${f} is off`),
    }),
    rule({
      id: 'recommended-flags',
      label: 'Further strictness flags the repository could turn on',
      weight: 6,
      value: recommended.length,
      full: RECOMMENDED_FLAGS.length,
      details: recommended.map((f) => `tsconfig.json: ${f} is off`),
    }),
    rule({
      id: 'type-coverage',
      label: 'TypeScript files outside the type-checked project',
      weight: 6,
      value: untyped.length,
      full: 20,
      details: top(untyped),
    }),
    rule({
      id: 'tsc',
      label: 'tsc --noEmit errors',
      weight: 20,
      value: tsc.findings.length,
      full: 5,
      details: top(tsc.findings),
    }),
    rule({
      id: 'boundaries',
      label: 'Module boundary violations (check-boundaries)',
      weight: 10,
      value: bounds.findings.length,
      full: 3,
      details: top(bounds.findings),
    }),
    rule({
      id: 'prettier',
      label: 'Files prettier would change',
      weight: 8,
      value: pretty.findings.length,
      full: 5,
      details: top(pretty.findings),
    }),
    rule({
      id: 'non-null',
      label: 'Non-null assertions (!) in source',
      weight: 15,
      value: nonNull,
      full: 300,
      details: top(locations(source, 'nonNull')),
    }),
    rule({
      id: 'double-cast',
      label: 'Double casts (as unknown as)',
      weight: 10,
      value: casts,
      full: 40,
      details: top(locations(source, 'unknownCasts')),
    }),
  ];
}
