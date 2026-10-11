#!/usr/bin/env node
// Regenerates the committed Codex protocol types (packages/providers/generated/<schema>-ts) from the installed `codex`
// binary. Only the release pinned in compat.json is regenerated in place; a newer CLI is verified first
// (docs/provider-compatibility.md).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    check: { type: 'boolean', default: false },
    digest: { type: 'boolean', default: false },
    root: { type: 'string', default: fileURLToPath(new URL('..', import.meta.url)) },
  },
});
const generated = path.join(values.root, 'packages/providers/generated');
const compatFile = path.join(generated, 'compat.json');
const compat = JSON.parse(readFileSync(compatFile, 'utf8'));
const target = path.join(generated, `${compat.schema}-ts`);
const pinned = compat.schema.replace('codex-', '');

function treeDigest(directory) {
  const hash = createHash('sha256');
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join('/'))
    .sort();
  for (const file of files)
    hash
      .update(`${file}\0`)
      .update(readFileSync(path.join(directory, file)))
      .update('\0');
  return hash.digest('hex');
}

if (values.digest) {
  console.log(treeDigest(target));
  process.exit(0);
}

const installed = /\d+\.\d+\.\d+/.exec(
  execFileSync('codex', ['--version'], { encoding: 'utf8' }),
)?.[0];
if (installed !== pinned) {
  console.error(
    `codex ${installed} is installed but the committed types are ${pinned}; install ${pinned} first.`,
  );
  process.exit(1);
}

const out = mkdtempSync(path.join(tmpdir(), 'aether-codex-gen-'));
try {
  execFileSync('codex', ['app-server', 'generate-ts', '--out', out], {
    stdio: 'ignore',
    timeout: 120_000,
  });
  if (values.check) {
    try {
      execFileSync('diff', ['-rq', out, target], { stdio: 'ignore' });
      console.log(`${compat.schema}-ts matches the installed binary.`);
    } catch {
      console.error(`${compat.schema}-ts differs from what the installed binary generates.`);
      process.exitCode = 1;
    }
  } else {
    rmSync(target, { recursive: true, force: true });
    cpSync(out, target, { recursive: true });
    writeFileSync(
      compatFile,
      `${JSON.stringify({ ...compat, sha256: treeDigest(target) }, null, 2)}\n`,
    );
    console.log(`rewrote ${path.relative(values.root, target)} and its digest in compat.json`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
