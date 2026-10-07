import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RULE_NAMES, regressions, tally, violationsIn } from './design-token-rules.mjs';

/**
 * The design-token gate: the stylesheets take their colors, type sizes, spacing, radii and layers from
 * apps/web/src/tokens.css and nothing else (AGENTS.md, UI rules). A raw value anywhere else is a violation, so the
 * scale cannot drift back into one-off numbers. 0, 1px hairlines, 50% and unitless values are not scale values.
 *
 * The strict rules (literal px sizes, vh, @media px off the scale, px custom properties, literal seconds, shadows and
 * line heights, !important: scripts/design-token-rules.mjs) are held to scripts/design-token-baseline.json: the count of
 * each, per rule and per file, may only go down. A line that is genuinely geometry or a user preference says so with
 * `/* token-lint: geometry *\/` and is not counted. `--update` lowers the baseline to today's counts (and refuses to raise
 * it); `--list` prints every counted violation.
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

const BASELINE = 'scripts/design-token-baseline.json';
const violations = [];
const sources = [];
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist'].includes(entry.name)) await visit(file);
      continue;
    }
    if (!file.endsWith('.css') || entry.name === TOKENS) continue;
    const text = await readFile(file, 'utf8');
    sources.push({ file: file.split(path.sep).join('/'), text });
    const lines = text.split('\n');
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

const current = tally(sources);
if (process.argv.includes('--list'))
  for (const { file, text } of sources)
    for (const v of violationsIn(text, { tokens: path.basename(file) === TOKENS }))
      console.log(`${file}:${v.line}: ${v.rule} ${v.text}`);
let baseline = null;
try {
  baseline = JSON.parse(await readFile(BASELINE, 'utf8'));
} catch {
  // no baseline yet: --update writes the first one
}
const worse = baseline ? regressions(baseline, current) : [];
if (process.argv.includes('--update') && !worse.length) {
  await writeFile(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`design tokens: baseline written to ${BASELINE}`);
} else if (worse.length) {
  console.error(
    `design tokens: strict rules got worse than ${BASELINE} (counts may only go down; mark a real exception with /* token-lint: <reason> */):\n${worse.join('\n')}`,
  );
  process.exit(1);
}
const total = RULE_NAMES.reduce((n, r) => n + current.counts[r], 0);
console.log(
  `design tokens: no raw colors, sizes, spacing, radii or layers outside tokens.css; ${total} strict violations, none above the baseline`,
);
