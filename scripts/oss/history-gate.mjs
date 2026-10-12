#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'aether-history-verify/1';

const REQUIRED = {
  'L8-01': [
    'structure',
    'pnpm install',
    'typecheck',
    'full test suite',
    'readiness check (history)',
  ],
  'L8-02': ['readiness check (history)'],
  'L8-04': ['structure', 'repository size'],
};

export function evidenceProblems(id, evidence, head) {
  if (evidence?.schema !== SCHEMA) return [`not an ${SCHEMA} record`];
  const problems = [];
  if (evidence.cloneHead !== head)
    problems.push(
      `the record is for ${evidence.cloneHead?.slice(0, 8)}, HEAD is ${head.slice(0, 8)}`,
    );
  if (id === 'L8-01' && evidence.verdict !== 'GO') problems.push(`verdict is ${evidence.verdict}`);
  for (const prefix of REQUIRED[id]) {
    const step = evidence.steps?.find((s) => s.name.startsWith(prefix));
    if (!step) problems.push(`no "${prefix}" step`);
    else if (step.state !== 'PASS') problems.push(`"${step.name}" is ${step.state}`);
  }
  return problems;
}

export function shapeProblems(git) {
  const problems = [];
  const lines = (args) => git(args).split('\n').filter(Boolean);
  const refs = lines(['for-each-ref', '--format=%(refname)']).filter(
    (r) => r !== 'refs/heads/main',
  );
  if (refs.length)
    problems.push(`${refs.length} refs besides main (${refs.slice(0, 3).join(', ')} …)`);
  if (lines(['remote']).length) problems.push('a remote is configured');
  if (lines(['worktree', 'list']).length > 1) problems.push('another worktree is attached');
  return problems;
}

function main(id) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
  let problems;
  if (id === 'L8-08') problems = shapeProblems(git);
  else if (REQUIRED[id]) {
    const file = process.env.OSS_HISTORY_EVIDENCE;
    if (!file)
      problems = ['set OSS_HISTORY_EVIDENCE to the file history-verify.sh --evidence wrote'];
    else
      problems = evidenceProblems(
        id,
        JSON.parse(readFileSync(file, 'utf8')),
        git(['rev-parse', 'HEAD']).trim(),
      );
  } else problems = [`unknown gate "${id}"`];
  for (const p of problems) process.stdout.write(`${id}: ${p}\n`);
  if (!problems.length) process.stdout.write(`${id}: ok\n`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv[2] ?? '');
