import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const violations = [];
async function visit(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(e.name)) continue;
    const file = path.join(dir, e.name);
    if (e.isDirectory()) {
      await visit(file);
      continue;
    }
    if (!/\.(ts|tsx|mjs)$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    const imports = [...source.matchAll(/(?:from\s*|import\s*\()['"]([^'"\n]+)['"]/g)].map(
      (m) => m[1],
    );
    for (const item of imports) {
      const banned =
        (file.startsWith('packages/kernel/') &&
          /^(node:|react|three|fastify|better-sqlite3|@aether\/providers)/.test(item)) ||
        ((file.startsWith('apps/web/') || file.startsWith('packages/office-scene/')) &&
          /^(node:|fastify|better-sqlite3|@aether\/providers)/.test(item)) ||
        (file.startsWith('apps/runner/') && /control\/(src|dist)\/db/.test(item)) ||
        (file.startsWith('packages/providers/') && /control\//.test(item));
      if (banned) violations.push(`${file}: prohibited dependency ${item}`);
    }
    // Untrusted text (messages, terminal output, provider content) must never reach the DOM as HTML,
    // and terminal output must never gain clipboard or link-opening abilities.
    if (
      file.startsWith('apps/web/') &&
      /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(|@xterm\/addon-(clipboard|web-links)/.test(
        source,
      )
    )
      violations.push(`${file}: unsafe HTML, code evaluation or terminal addon`);
    // Progress and completion must come from persisted state, never from randomness.
    if (/Math\.random\(/.test(source)) violations.push(`${file}: Math.random in product code`);
    if (/@ts-ignore|@ts-nocheck/.test(source)) violations.push(`${file}: suppressed type safety`);
  }
}
await visit('apps');
await visit('packages');
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log('AETHER dependency boundaries passed.');
