// Area 4: UI system and design tokens. The existing token lint plus the rules proposed in docs/internal/ui-token-audit.md
// section 5, counted per declaration; compared with scripts/design-token-baseline.json when that file exists.
import { ROLE_VARIANCE_PATHS } from '../inputs.mjs';
import { at, top } from '../lib.mjs';
import { info, rule, skipped } from '../model.mjs';
import { matching, runCommand } from '../repo.mjs';
import {
  BREAKPOINTS,
  RULES,
  declarations,
  mediaViolations,
  violationsIn,
} from '../../design-token-rules.mjs';

const BASELINE = 'scripts/design-token-baseline.json';
const PHYSICAL =
  /^(margin|padding)-(left|right)$|^(left|right)$|^border-(left|right)(-[a-z]+)*$|^text-align$/;

// The rules themselves live in scripts/design-token-rules.mjs, shared with the gate (check-design-tokens.mjs).
export { BREAKPOINTS, RULES, declarations, mediaViolations };

export const physicalProperties = (text) =>
  declarations(text).filter(({ property }) => PHYSICAL.test(property));

/** Counts per rule name over the style files: { counts, lines }. A line with the escape hatch is not counted. */
export function measureStyles(repo, files) {
  const counts = {};
  const lines = {};
  for (const file of files)
    for (const { rule, line, text } of violationsIn(repo.read(file), {
      tokens: /(^|\/)tokens\.css$/.test(file),
    })) {
      counts[rule] = (counts[rule] ?? 0) + 1;
      (lines[rule] ??= []).push(at(file, line, text));
    }
  return { counts, lines };
}

function baselineCounts(repo) {
  if (!repo.exists(BASELINE)) return null;
  const parsed = JSON.parse(repo.read(BASELINE));
  return parsed.counts ?? parsed.rules ?? parsed;
}

function roleVarianceRule(repo) {
  const file = ROLE_VARIANCE_PATHS.find((f) => repo.exists(f));
  if (!file)
    return skipped(
      'role-variance',
      'Distinct control sizes per role (e2e/ui/role-variance.spec.ts)',
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
  const escapes = styles.flatMap((f) =>
    repo
      .read(f)
      .split('\n')
      .flatMap((text, i) => (text.includes('token-lint:') ? [at(f, i + 1, text.trim())] : [])),
  );
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
    // The escape hatch keeps the other counts at zero, so its own total is a budget: genuine geometry may be marked, but a
    // growing pile of marks means values are being hidden rather than tokenised.
    rule({
      id: 'escape-comments',
      label: 'token-lint escape comments over the budget of 100',
      weight: 10,
      value: escapes.length,
      limit: 100,
      full: 200,
      details: top(escapes),
    }),
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
