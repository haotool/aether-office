import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The design-token gate: the stylesheets take their colors, type sizes, spacing, radii and layers from
 * apps/web/src/tokens.css and nothing else (AGENTS.md, UI rules). A raw value anywhere else is a violation, so the
 * scale cannot drift back into one-off numbers. 0, 1px hairlines, 50% and unitless values are not scale values.
 */
const root = 'apps/web/src';
const TOKENS = 'tokens.css';
const rules = [
  ['color', /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, () => true],
  ['z-index', /^z-index$/, (v) => !/^(var\(--z-[a-z-]+\)|-?[01]|auto)$/.test(v)],
  ['font-size', /^font(-size)?$/, (v) => /\d(px|rem)\b/.test(v.replace(/\/\s*[\d.]+[a-z]*/g, ''))],
  [
    'spacing',
    /^(padding|margin|gap|row-gap|column-gap)(-[a-z]+)*$/,
    (v) => /(?<![\w.-])\d*[1-9]\d*(\.\d+)?(px|rem|em)\b/.test(v),
  ],
  [
    'radius',
    /^border(-[a-z]+)*-radius$|^border-radius$/,
    (v) => /(?<![\w.-])([2-9]|\d{2,})(\.\d+)?px\b/.test(v),
  ],
];

const violations = [];
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist'].includes(entry.name)) await visit(file);
      continue;
    }
    if (!file.endsWith('.css') || entry.name === TOKENS) continue;
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      const declaration = line.match(/^\s*([a-z-]+):\s*(.*?);?\s*(\/\*.*)?$/);
      if (!declaration || declaration[1].startsWith('--')) return;
      const [, property, value] = declaration;
      const colorRule = rules[0];
      if (colorRule[1].test(value))
        violations.push(`${file}:${i + 1}: raw color in ${property} (use a token)`);
      for (const [name, matches, bad] of rules.slice(1))
        if (matches.test(property) && bad(value))
          violations.push(`${file}:${i + 1}: raw ${name} "${value}" (use the ${name} token scale)`);
    });
  }
}
await visit(root);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('design tokens: no raw colors, sizes, spacing, radii or layers outside tokens.css');
