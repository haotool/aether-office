#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE_FILE, diskRepo } from '../repo.mjs';
import { scoreRepository } from '../run.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const MARKER_RULES = new Set(['suppressions', 'todo-markers', 'console-output']);
const COMMENTED_OUT =
  /^\s*\/\/\s*(?:(?:const|let|var|import|export|return|await|throw)\b.*[;{(,]|[\w.]+\([^)]*\);)\s*$/;

export function commentedOutCode(repo) {
  return repo.files
    .filter((f) => CODE_FILE.test(f))
    .flatMap((file) =>
      repo
        .read(file)
        .split('\n')
        .flatMap((line, i) => (COMMENTED_OUT.test(line) ? [`${file}:${i + 1}`] : [])),
    );
}

async function main() {
  const [structure] = (await scoreRepository(root, ['structure'])).areas;
  const found = structure.rules.filter((r) => MARKER_RULES.has(r.id) && r.value > 0);
  const lines = found.flatMap((r) => [`${r.id}: ${r.value}`, ...r.details.map((d) => `  ${d}`)]);
  const commented = commentedOutCode(diskRepo(root));
  if (commented.length)
    lines.push(`commented-out code: ${commented.length}`, ...commented.map((c) => `  ${c}`));
  process.stdout.write(lines.length ? `${lines.join('\n')}\n` : 'L1-07: ok\n');
  process.exit(lines.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
