/**
 * The strict design-token rules (docs/internal/ui-token-audit.md section 5), as pure functions over CSS text. The gate
 * (check-design-tokens.mjs) compares their counts with scripts/design-token-baseline.json and the quality scorecard
 * (scripts/quality/areas/ui.mjs) reports the same numbers, so both read this one file.
 *
 * A declaration on one line may carry the escape hatch `/* token-lint: <reason> *\/` (for example `geometry`: a 3D HUD
 * plaque or a drawing's own size, `preference`: a user preference that must outrank every rule). The hatch exempts that
 * line from every rule; the reason is for the reader.
 */

/** The media-query widths (and the one height) the layout may use; a value one above is the `min-` partner of a `max-`. */
export const BREAKPOINTS = [500, 760, 1000, 1250];

/**
 * Genuine exceptions to the breakpoint scale: a threshold that is not a layout step but a measured fact about one
 * component. Each carries the reason, which the docs repeat (docs/design-system.md).
 */
export const MEDIA_EXCEPTIONS = [
  {
    px: 700,
    reason:
      'a short phone (an SE is 667px tall): the floor rail stands on the new-task button instead of the middle',
  },
  {
    px: 880,
    reason:
      'the scene shell keeps the control-room wall its minimum height on a roomy window (MIN_HEIGHT in multi-view.ts)',
  },
  {
    px: 1500,
    reason:
      'the top bar holds the telemetry numbers only above the width where brand, picker, numbers and controls fit',
  },
  { px: 1800, reason: 'an ultra-wide window: a wider sidebar and page padding, not a layout step' },
];

const LITERAL_PX = /(?<![\w.-])([2-9]|\d{2,})(\.\d+)?px\b/;
const SIZE_PROPERTY = /^(min-|max-)?(width|height)$|^(inset|top|left|right|bottom)(-[a-z]+)*$/;
const HATCH = /token-lint:/;
const noVars = (value) => value.replace(/var\([^)]*\)/g, '');

/** [property, value, line, escaped] for each single-line declaration, comments cut off. */
export function declarations(text) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const match = /^\s*([a-z-]+):\s*(.*?);?\s*(\/\*.*)?$/.exec(raw);
    if (match)
      out.push({ property: match[1], value: match[2], line: i + 1, escaped: HATCH.test(raw) });
  });
  return out;
}

/** Each rule: does this declaration break it? */
export const RULES = {
  'literal-size': ({ property, value }) =>
    SIZE_PROPERTY.test(property) && LITERAL_PX.test(noVars(value)),
  'viewport-height': ({ value }) => /\d(?:\.\d+)?vh\b/.test(value),
  'literal-duration': ({ property, value }) =>
    /^(transition|animation)(-duration|-delay)?$/.test(property) &&
    /(?<![\w.-])\d*\.?\d*[1-9]\d*m?s\b/.test(noVars(value)),
  'literal-shadow': ({ property, value }) =>
    /^(box|text)-shadow$/.test(property) && /\d+px/.test(noVars(value)),
  'literal-line-height': ({ property, value }) =>
    property === 'line-height' && !/^(var\(--lh-|inherit$|normal$)/.test(value),
  important: ({ value }) => /!important/.test(value),
  'custom-property-literal': ({ property, value }) =>
    property.startsWith('--') && /\d+(\.\d+)?px/.test(value),
};
export const RULE_NAMES = [...Object.keys(RULES), 'media-breakpoint'];

const allowedMedia = (px) =>
  BREAKPOINTS.some((b) => px === b || px === b + 1) ||
  MEDIA_EXCEPTIONS.some((e) => px === e.px || px === e.px + 1);

/** The `@media` lines with a px value off the scale (and not an exception). */
export function mediaViolations(text) {
  const bad = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim().startsWith('@media') || HATCH.test(line)) return;
    for (const m of line.matchAll(/(\d+)px/g))
      if (!allowedMedia(Number(m[1]))) bad.push({ line: i + 1, text: line.trim() });
  });
  return bad;
}

/** Every violation in one stylesheet's text: [{ rule, line, text }]. tokens.css is the one file that may hold raw values. */
export function violationsIn(text, { tokens = false } = {}) {
  if (tokens) return [];
  const found = [];
  for (const d of declarations(text)) {
    if (d.escaped) continue;
    for (const [rule, bad] of Object.entries(RULES))
      if (bad(d))
        found.push({ rule, line: d.line, text: `${d.property}: ${d.value}`.slice(0, 80) });
  }
  for (const m of mediaViolations(text)) found.push({ rule: 'media-breakpoint', ...m });
  return found;
}

/** { counts: {rule: n}, files: {rule: {file: n}} } for [{ file, text }]. */
export function tally(sources) {
  const counts = Object.fromEntries(RULE_NAMES.map((r) => [r, 0]));
  const files = Object.fromEntries(RULE_NAMES.map((r) => [r, {}]));
  for (const { file, text } of sources)
    for (const { rule } of violationsIn(text, { tokens: /(^|\/)tokens\.css$/.test(file) })) {
      counts[rule] += 1;
      files[rule][file] = (files[rule][file] ?? 0) + 1;
    }
  return { counts, files };
}

/** What got worse than the baseline: per rule and per file, as printable lines. Counts may only go down. */
export function regressions(baseline, current) {
  const out = [];
  for (const rule of RULE_NAMES) {
    const was = baseline.counts?.[rule] ?? 0;
    if (current.counts[rule] > was) out.push(`${rule}: ${was} -> ${current.counts[rule]}`);
    for (const [file, n] of Object.entries(current.files[rule]))
      if (n > (baseline.files?.[rule]?.[file] ?? 0))
        out.push(`  ${file}: ${rule} ${baseline.files?.[rule]?.[file] ?? 0} -> ${n}`);
  }
  return out;
}
