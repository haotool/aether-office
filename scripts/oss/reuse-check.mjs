#!/usr/bin/env node
// A small stand-in for `reuse lint` (https://reuse.software) that needs no Python: every tracked file must be covered by an
// annotation of REUSE.toml with a copyright and a licence, every licence named must have its text in LICENSES/, every
// file in LICENSES/ must be used, and every literal path in REUSE.toml must still exist. Exit 1 on a problem.
//
//   node scripts/oss/reuse-check.mjs [--root <repo>]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const parseValue = (raw) => {
  const value = raw.trim();
  if (value.startsWith('[')) return [...value.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  const string = /^"((?:[^"\\]|\\.)*)"$/.exec(value);
  return string ? string[1] : value;
};

/** Reads the [[annotations]] tables of a REUSE.toml (the subset of TOML the file uses: strings and string arrays). */
export function parseReuseToml(text) {
  const annotations = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*#.*$/, '').trim();
    if (!line) continue;
    if (line === '[[annotations]]') {
      current = {};
      annotations.push(current);
      continue;
    }
    const m = /^([\w-]+)\s*=\s*(.+)$/.exec(line);
    if (m && current) current[m[1]] = parseValue(m[2]);
  }
  return annotations.map((a) => ({
    paths: [a.path ?? []].flat(),
    copyright: [a['SPDX-FileCopyrightText'] ?? []].flat(),
    license: a['SPDX-License-Identifier'] ?? null,
  }));
}

/** REUSE globs: `*` matches within one path segment, `**` across segments. */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      out += '.*';
      i += 1;
    } else if (c === '*') out += '[^/]*';
    else out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

export const licenseIds = (expression) =>
  (expression?.match(/[A-Za-z0-9.+-]+/g) ?? []).filter((t) => !/^(AND|OR|WITH)$/.test(t));

export function check(files, annotations, licenseFiles) {
  const problems = [];
  const compiled = annotations.map((a) => ({ ...a, res: a.paths.map(globToRegExp) }));
  for (const file of files) {
    if (file === 'REUSE.toml' || file.startsWith('LICENSES/')) continue;
    const match = compiled.filter((a) => a.res.some((re) => re.test(file))).at(-1);
    if (!match) problems.push(`${file}: not covered by REUSE.toml`);
    else if (!match.license || !match.copyright.length)
      problems.push(`${file}: annotation lacks a licence or copyright`);
  }
  const used = new Set(annotations.flatMap((a) => licenseIds(a.license)));
  for (const id of used)
    if (!licenseFiles.includes(`${id}.txt`)) problems.push(`LICENSES/${id}.txt is missing`);
  for (const file of licenseFiles)
    if (!used.has(file.replace(/\.txt$/, '')))
      problems.push(`LICENSES/${file} is not used by REUSE.toml`);
  for (const a of compiled)
    a.paths.forEach((p, i) => {
      if (!files.some((f) => a.res[i].test(f)))
        problems.push(`REUSE.toml: "${p}" matches no tracked file`);
    });
  return problems;
}

function main() {
  const { values } = parseArgs({ options: { root: { type: 'string', default: process.cwd() } } });
  const root = path.resolve(values.root);
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const toml = path.join(root, 'REUSE.toml');
  const problems = existsSync(toml)
    ? check(
        files,
        parseReuseToml(readFileSync(toml, 'utf8')),
        existsSync(path.join(root, 'LICENSES')) ? readdirSync(path.join(root, 'LICENSES')) : [],
      )
    : ['REUSE.toml is missing'];
  for (const p of problems) process.stdout.write(`FAIL ${p}\n`);
  process.stdout.write(problems.length ? '' : `REUSE: ${files.length} tracked files covered.\n`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
