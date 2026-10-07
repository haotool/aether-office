// Area 4: UI system and design tokens. The existing token lint plus the rules proposed in docs/research/ui-token-audit.md
// section 5, counted per declaration; compared with scripts/design-token-baseline.json when that file exists.
import { at, top } from '../lib.mjs';
import { info, rule, skipped } from '../model.mjs';
import { matching, runCommand } from '../repo.mjs';

const TOKENS = /(^|\/)tokens\.css$/;
const BASELINE = 'scripts/design-token-baseline.json';
const ROLE_RESULTS = ['evidence/role-variance.json', 'test-results/role-variance.json'];
/** Media-query widths the layout may use; a width one pixel above is the `min-width` partner of a `max-width`. */
export const BREAKPOINTS = [500, 760, 1000, 1250];
const LITERAL_PX = /(?<![\w.-])([2-9]|\d{2,})(\.\d+)?px\b/;

const SIZE_PROPERTY = /^(min-|max-)?(width|height)$|^(inset|top|left|right|bottom)(-[a-z]+)*$/;
const PHYSICAL =
  /^(margin|padding)-(left|right)$|^(left|right)$|^border-(left|right)(-[a-z]+)*$|^text-align$/;

/** [property, value, line] for each single-line declaration, comments cut off. */
export function declarations(text) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const match = /^\s*([a-z-]+):\s*(.*?);?\s*(\/\*.*)?$/.exec(raw);
    if (match) out.push({ property: match[1], value: match[2], line: i + 1 });
  });
  return out;
}

export const RULES = {
  'literal-size': ({ property, value }) =>
    SIZE_PROPERTY.test(property) && LITERAL_PX.test(value.replace(/var\([^)]*\)/g, '')),
  'viewport-height': ({ value }) => /\d(?:\.\d+)?vh\b/.test(value),
  'literal-duration': ({ property, value }) =>
    /^(transition|animation)(-duration|-delay)?$/.test(property) &&
    /(?<![\w.-])\d*\.?\d*[1-9]\d*m?s\b/.test(value.replace(/var\([^)]*\)/g, '')),
  'literal-shadow': ({ property, value }) =>
    /^(box|text)-shadow$/.test(property) && /\d+px/.test(value.replace(/var\([^)]*\)/g, '')),
  'literal-line-height': ({ property, value }) =>
    property === 'line-height' && !/^(var\(--lh-|inherit$|normal$)/.test(value),
  important: ({ value }) => /!important/.test(value),
  'custom-property-literal': ({ property, value }) =>
    property.startsWith('--') && /\d+(\.\d+)?px/.test(value),
};

export function mediaViolations(text) {
  const bad = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim().startsWith('@media')) return;
    for (const m of line.matchAll(/(\d+)px/g)) {
      const px = Number(m[1]);
      if (!BREAKPOINTS.some((b) => px === b || px === b + 1))
        bad.push({ line: i + 1, text: line.trim() });
    }
  });
  return bad;
}

export const physicalProperties = (text) =>
  declarations(text).filter(({ property }) => PHYSICAL.test(property));

/** Counts per rule name over the style files: { counts, lines }. */
export function measureStyles(repo, files) {
  const counts = {};
  const lines = {};
  const add = (name, entry) => {
    counts[name] = (counts[name] ?? 0) + 1;
    (lines[name] ??= []).push(entry);
  };
  for (const file of files) {
    const text = repo.read(file);
    const found = TOKENS.test(file) ? [] : declarations(text);
    for (const d of found)
      for (const [name, bad] of Object.entries(RULES))
        if (bad(d)) add(name, at(file, d.line, `${d.property}: ${d.value}`.slice(0, 80)));
    if (!TOKENS.test(file))
      for (const m of mediaViolations(text)) add('media-breakpoint', at(file, m.line, m.text));
  }
  return { counts, lines };
}

function baselineCounts(repo) {
  if (!repo.exists(BASELINE)) return null;
  const parsed = JSON.parse(repo.read(BASELINE));
  return parsed.counts ?? parsed.rules ?? parsed;
}

function roleVarianceRule(repo) {
  const file = ROLE_RESULTS.find((f) => repo.exists(f));
  if (!file)
    return skipped(
      'role-variance',
      'Distinct control sizes per role (e2e/role-variance.spec.ts)',
      20,
      'not run: the spec has no recorded result (expected evidence/role-variance.json)',
    );
  const { violations = [] } = JSON.parse(repo.read(file));
  return rule({
    id: 'role-variance',
    label: 'Roles with more distinct sizes than allowed',
    weight: 20,
    value: violations.length,
    full: 10,
    details: top(
      violations.map(
        (v) =>
          `${v.page ?? '?'} ${v.viewport ?? ''} ${v.role}: ${v.distinct} distinct (max ${v.max})`,
      ),
    ),
  });
}

export function ui(repo, { root = repo.root } = {}) {
  const styles = matching(repo, /\.css$/).filter(
    (f) => f.startsWith('apps/') || f.startsWith('packages/'),
  );
  const lint = runCommand(process.execPath, ['scripts/check-design-tokens.mjs'], { cwd: root });
  const lintLines =
    lint.status === 0 ? [] : lint.output.split('\n').filter((l) => l.includes('.css:'));
  const { counts, lines } = measureStyles(repo, styles);
  const baseline = baselineCounts(repo);
  const regressions = baseline
    ? Object.entries(counts)
        .filter(([name, n]) => n > (baseline[name] ?? 0))
        .map(([name, n]) => `${name}: ${n} now, baseline ${baseline[name] ?? 0}`)
    : [];
  const count = (name) => counts[name] ?? 0;
  const physical = styles.reduce((n, f) => n + physicalProperties(repo.read(f)).length, 0);
  const counted = (id, label, name, weight, full) =>
    rule({ id, label, weight, value: count(name), full, details: top(lines[name] ?? []) });
  return [
    rule({
      id: 'token-lint',
      label: 'Raw colours, sizes, spacing, radii and layers (check-design-tokens)',
      weight: 20,
      value: lintLines.length,
      full: 30,
      details: top(lintLines),
    }),
    counted('literal-size', 'Literal px width, height, min/max or inset', 'literal-size', 10, 300),
    counted('viewport-height', 'vh units (use dvh)', 'viewport-height', 5, 10),
    counted(
      'media-breakpoint',
      `@media widths outside ${BREAKPOINTS.join('/')}`,
      'media-breakpoint',
      5,
      20,
    ),
    counted(
      'literal-duration',
      'Literal transition and animation seconds',
      'literal-duration',
      5,
      120,
    ),
    counted('literal-shadow', 'Literal box and text shadows', 'literal-shadow', 5, 30),
    counted('literal-line-height', 'Literal line-height values', 'literal-line-height', 5, 120),
    counted('important', '!important declarations', 'important', 5, 20),
    counted(
      'custom-property-literal',
      'px custom properties outside tokens.css',
      'custom-property-literal',
      5,
      20,
    ),
    baseline
      ? rule({
          id: 'baseline-regression',
          label: `Rules above ${BASELINE}`,
          weight: 15,
          value: regressions.length,
          full: 3,
          details: regressions,
        })
      : skipped(
          'baseline-regression',
          `Rules above ${BASELINE}`,
          15,
          `no ${BASELINE}: the counts above are absolute`,
        ),
    roleVarianceRule(repo),
    info(
      'physical-properties',
      'Physical left/right properties (logical ones are RTL-ready)',
      physical,
    ),
  ];
}
