#!/usr/bin/env node
// Copied-code scan: finds long verbatim overlaps between the tracked files of this repository and local clones of reference
// projects, so a reviewer can tell "inspired by" from "copied from". Read-only, no network.
//
//   node scripts/oss/overlap-scan.mjs --refs <dir-of-clones> [--tokens 50] [--exclude <project>]... [--json]
//
// Files are reduced to their word tokens (identifiers, keywords, numbers, words in strings and comments); punctuation,
// quotes, semicolons, line breaks and indentation are ignored, so reformatting (Prettier, re-wrapped Markdown) does not hide
// a copy. Every run of `--tokens` consecutive tokens is hashed (two 32-bit rolling hashes); matching runs are merged into
// blocks. 50 tokens is roughly 300 characters or 8 to 10 lines of code. The numbers are evidence, not a verdict: licence
// texts, the Contributor Covenant and protocol schemas match legitimately and must be judged by reading the block.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    refs: { type: 'string' },
    root: { type: 'string', default: process.cwd() },
    tokens: { type: 'string', default: '50' },
    // Projects whose licence forbids even analysing them (see docs/legal/provenance.md) are skipped by name.
    exclude: { type: 'string', multiple: true, default: [] },
    json: { type: 'boolean', default: false },
  },
});
const EXCLUDED = new Set(values.exclude);
if (!values.refs) {
  process.stderr.write('usage: overlap-scan.mjs --refs <dir-of-clones> [--tokens 50] [--json]\n');
  process.exit(2);
}
const W = Number(values.tokens);
const TEXT =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|css|scss|html|md|mdx|json|ya?ml|sh|toml|sql|swift|kt|txt)$|(^|\/)(LICENSE|NOTICE)[^/]*$/i;
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.next',
  'coverage',
]);
// Generated files and licence texts (which match every project under the same licence) are not indexed.
const NOT_INDEXED =
  /^(pnpm-lock\.yaml$|packages\/providers\/generated\/|LICENSE$|LICENSES\/|THIRD_PARTY_NOTICES\.md$)/;
const MAX_BYTES = 512 * 1024;
const B1 = 1000003;
const B2 = 916_891;

function tokenize(text) {
  const tokens = [];
  const lineOf = [];
  let line = 1;
  const re = /\n|[A-Za-z_$][\w$]*|\d+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === '\n') line += 1;
    else {
      tokens.push(m[0]);
      lineOf.push(line);
    }
  }
  return { tokens, lineOf };
}

const tokenHash = (t) => {
  let h = 2166136261;
  for (let i = 0; i < t.length; i += 1) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return h >>> 0;
};

// Yields [position, key] for every window of W tokens; key fits in a safe integer.
function* windows(tokens) {
  if (tokens.length < W) return;
  let p1 = 1;
  let p2 = 1;
  for (let i = 0; i < W - 1; i += 1) {
    p1 = Math.imul(p1, B1);
    p2 = Math.imul(p2, B2);
  }
  const hs = tokens.map(tokenHash);
  const gs = hs.map((h) => h ^ 0x5bd1e995);
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (i >= W) {
      h1 = (h1 - Math.imul(hs[i - W], p1)) | 0;
      h2 = (h2 - Math.imul(gs[i - W], p2)) | 0;
    }
    h1 = (Math.imul(h1, B1) + hs[i]) | 0;
    h2 = (Math.imul(h2, B2) + gs[i]) | 0;
    if (i >= W - 1) yield [i - W + 1, (h1 >>> 0) * 1048576 + ((h2 >>> 0) & 0xfffff)];
  }
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile() && TEXT.test(entry.name)) {
      yield full;
    }
  }
}

const readSmall = (file) => {
  try {
    return statSync(file).size <= MAX_BYTES ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
};

const root = path.resolve(values.root);
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && TEXT.test(f) && !NOT_INDEXED.test(f));
const index = new Map(); // window key -> [file id, position] pairs, flattened
const repo = [];
for (const file of tracked) {
  const text = readSmall(path.join(root, file));
  if (text === null) continue;
  const id = repo.push({ file, ...tokenize(text) }) - 1;
  for (const [pos, k] of windows(repo[id].tokens)) {
    const list = index.get(k);
    if (list) list.push(id, pos);
    else index.set(k, [id, pos]);
  }
}

function blocksOf(pairs, projectDir) {
  const blocks = [];
  for (const [pairKey, covered] of pairs) {
    const [id, refFile] = pairKey.split('\u0000');
    const { file, tokens, lineOf } = repo[Number(id)];
    const sorted = [...covered].sort((a, b) => a - b);
    let start = 0;
    for (let i = 1; i <= sorted.length; i += 1) {
      if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
      const from = sorted[start];
      const to = sorted[i - 1];
      blocks.push({
        file,
        refFile: path.relative(projectDir, refFile),
        fromLine: lineOf[from],
        toLine: lineOf[to],
        tokens: to - from + 1,
        chars: tokens.slice(from, to + 1).join(' ').length,
      });
      start = i;
    }
  }
  return blocks.sort((a, b) => b.tokens - a.tokens);
}

const report = [];
const refsDir = path.resolve(values.refs);
for (const project of readdirSync(refsDir).sort()) {
  const projectDir = path.join(refsDir, project);
  if (!statSync(projectDir).isDirectory() || EXCLUDED.has(project)) continue;
  const pairs = new Map();
  let filesScanned = 0;
  for (const refFile of walk(projectDir)) {
    const text = readSmall(refFile);
    if (text === null) continue;
    filesScanned += 1;
    for (const [, k] of windows(tokenize(text).tokens)) {
      const hits = index.get(k);
      if (!hits) continue;
      for (let h = 0; h < hits.length; h += 2) {
        const pairKey = `${hits[h]}\u0000${refFile}`;
        const covered = pairs.get(pairKey) ?? new Set();
        for (let j = 0; j < W; j += 1) covered.add(hits[h + 1] + j);
        pairs.set(pairKey, covered);
      }
    }
  }
  const blocks = blocksOf(pairs, projectDir);
  report.push({
    project,
    filesScanned,
    blocks: blocks.length,
    repoFiles: [...new Set(blocks.map((b) => b.file))],
    matchedTokens: blocks.reduce((n, b) => n + b.tokens, 0),
    top: blocks.slice(0, 20),
  });
}

if (values.json) {
  process.stdout.write(
    `${JSON.stringify({ tokens: W, repoFiles: repo.length, report }, null, 2)}\n`,
  );
} else {
  process.stdout.write(`Indexed ${repo.length} tracked files; window ${W} word tokens.\n`);
  for (const r of report) {
    process.stdout.write(
      `\n${r.project}: ${r.filesScanned} files scanned, ${r.blocks} blocks in ${r.repoFiles.length} files (${r.matchedTokens} tokens)\n`,
    );
    for (const b of r.top) {
      process.stdout.write(
        `  ${b.file}:${b.fromLine}-${b.toLine} <- ${b.refFile} (${b.tokens} tokens, ${b.chars} chars)\n`,
      );
    }
  }
}
