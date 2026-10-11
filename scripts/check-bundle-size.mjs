import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_BUDGET_KB = 870;
const CHUNK_BUDGET_KB = 400;
const directory = 'apps/web/dist/assets';
const sizes = readdirSync(directory)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, kb: gzipSync(readFileSync(join(directory, name))).length / 1024 }))
  .sort((a, b) => b.kb - a.kb);
if (sizes.length === 0) throw new Error(`${directory} has no JavaScript: run pnpm build first`);
const total = sizes.reduce((sum, { kb }) => sum + kb, 0);
const failures = [];
if (total > TOTAL_BUDGET_KB)
  failures.push(`total ${total.toFixed(0)} KB gzip exceeds ${TOTAL_BUDGET_KB} KB`);
if (sizes[0].kb > CHUNK_BUDGET_KB)
  failures.push(`${sizes[0].name} ${sizes[0].kb.toFixed(0)} KB gzip exceeds ${CHUNK_BUDGET_KB} KB`);
console.log(
  `web JS: ${total.toFixed(0)} KB gzip in ${sizes.length} files, largest ${sizes[0].name} ${sizes[0].kb.toFixed(0)} KB`,
);
if (failures.length > 0) {
  for (const failure of failures) console.error(`bundle budget: ${failure}`);
  process.exit(1);
}
