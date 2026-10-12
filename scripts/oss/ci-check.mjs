#!/usr/bin/env node
// Static review of .github/workflows: every action pinned to a commit SHA, read-only permissions, no
// pull_request_target, no step allowed to fail, a CodeQL job and a blocking advisory audit. Usage: node
// scripts/oss/ci-check.mjs [--root <repo>] (exit 1 and list every problem).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const SHA = /^[0-9a-f]{40}$/;
const code = (line) => line.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');

export function workflowProblems(name, text) {
  const problems = [];
  text.split('\n').forEach((raw, i) => {
    const line = code(raw);
    const use = /^\s*-?\s*uses:\s*(\S+)/.exec(line);
    const ref = use?.[1];
    if (ref && !ref.startsWith('./') && !SHA.test(ref.split('@')[1] ?? ''))
      problems.push(`${name}:${i + 1}: action is not pinned to a commit SHA (${ref})`);
    if (/\bpull_request_target\b/.test(line))
      problems.push(`${name}:${i + 1}: runs on pull_request_target`);
    if (/^\s*continue-on-error:\s*true\b/.test(line))
      problems.push(`${name}:${i + 1}: continue-on-error lets a failing step pass`);
    if (/^\s*permissions:\s*write-all\b/.test(line))
      problems.push(`${name}:${i + 1}: write-all permissions`);
  });
  const [head = '', jobs = ''] = text.split(/^jobs:/m);
  const topLevel = /^permissions:/m.test(head);
  const jobCount = (jobs.match(/^ {2}[\w-]+:\s*$/gm) ?? []).length;
  const jobPermissions = (jobs.match(/^ {4}permissions:/gm) ?? []).length;
  if (!topLevel && jobPermissions < jobCount)
    problems.push(`${name}: no top-level permissions, and not every job sets its own`);
  const block = /^permissions:\n((?: {2}.*\n)+)/m.exec(head)?.[1] ?? '';
  if (/:\s*write\b/.test(block)) problems.push(`${name}: top-level permissions grant write`);
  return problems;
}

export function ciProblems(root) {
  const dir = path.join(root, '.github/workflows');
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => /\.ya?ml$/.test(n)) : [];
  const texts = files.map((n) => [n, readFileSync(path.join(dir, n), 'utf8')]);
  const problems = texts.flatMap(([n, t]) => workflowProblems(n, t));
  if (!texts.some(([, t]) => /github\/codeql-action\/analyze@/.test(t)))
    problems.push('no workflow runs CodeQL (github/codeql-action/analyze)');
  if (!texts.some(([, t]) => /^\s*-?\s*run:\s*pnpm (run )?audit:gate\b/m.test(t)))
    problems.push('no workflow step runs `pnpm audit:gate`');
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { root: { type: 'string', default: process.cwd() } } });
  const problems = ciProblems(path.resolve(values.root));
  for (const p of problems) process.stdout.write(`${p}\n`);
  process.stdout.write(
    problems.length ? `${problems.length} problem(s).\n` : 'CI workflows: ok.\n',
  );
  process.exit(problems.length ? 1 : 0);
}
