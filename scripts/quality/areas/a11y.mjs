// Area 5: accessibility and i18n. Locale parity, inline bilingual strings against their baseline, and static
// accessibility heuristics on the JSX. An axe run is read from its recorded result; it is never started here.
import { at, grepLines, top } from '../lib.mjs';
import { rule, skipped } from '../model.mjs';
import { matching } from '../repo.mjs';

const LOCALES = 'apps/web/src/locales';
const INLINE_BASELINE = 'tests/aether/inline-i18n-baseline.json';
const AXE_RESULTS = ['evidence/axe-results.json', 'test-results/axe-results.json'];
const INLINE = /(?:\b(?:zh|en|isZh|isEn)\b|\b(?:locale|lang)\s*===\s*'(?:zh-TW|en)')\s*\?\s*[`'"]/g;
const UI_SOURCE = /^(apps\/web|packages\/office-scene)\/src\/.*\.tsx?$/;
const JSX_FILE = /^(apps\/web|packages\/office-scene)\/src\/.*\.tsx$/;

/** Top-level keys of a locale table: `  name:` or `  'name':` at two-space indent. */
export function localeKeys(text) {
  return new Set(
    [...text.matchAll(/^ {2}(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:/gm)].map((m) => m[1] ?? m[2]),
  );
}

/** [{ pair, missingIn, key }] for every en/zh table pair under the locales folder. */
export function parityGaps(repo) {
  const tables = matching(repo, new RegExp(`^${LOCALES}/[^/]+\\.ts$`));
  const gaps = [];
  for (const file of tables.filter((f) => /(^|[-/])en\.ts$/.test(f))) {
    const partner = file.replace(/en\.ts$/, 'zh.ts');
    if (!repo.exists(partner)) {
      gaps.push({ file, message: `${file}: no Traditional Chinese table ${partner}` });
      continue;
    }
    const en = localeKeys(repo.read(file));
    const zh = localeKeys(repo.read(partner));
    for (const key of en)
      if (!zh.has(key))
        gaps.push({ file: partner, message: `${partner}: missing "${key}" (present in ${file})` });
    for (const key of zh)
      if (!en.has(key))
        gaps.push({ file, message: `${file}: missing "${key}" (present in ${partner})` });
  }
  return gaps;
}

export function inlinePairs(repo) {
  const counts = {};
  for (const file of repo.files.filter((f) => UI_SOURCE.test(f) && !f.includes('/locales/'))) {
    const n = (repo.read(file).match(INLINE) ?? []).length;
    if (n > 0) counts[file] = n;
  }
  return counts;
}

/** Elements (`<button ... disabled ...>`) that are disabled with no title or description saying why. */
export function disabledWithoutReason(text) {
  const out = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  for (const m of text.matchAll(
    /<(?:button|input|select|textarea|[A-Z]\w*Button)\b((?:[^<>{}]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?)\/?>/gs,
  )) {
    const attrs = m[1];
    if (
      /\bdisabled\b/.test(attrs) &&
      !/\b(?:title|aria-describedby|aria-label|why)\s*=|\.\.\.(?:whyNot\(|why\b)/.test(attrs)
    )
      out.push(lineOf(m.index));
  }
  return out;
}

const imagesWithoutAlt = (text) =>
  grepLines(text, /<img\b(?![^>]*\balt\s*=)[^>]*>/).map((h) => h.line);
const clickableDivs = (text) =>
  [...text.matchAll(/<(?:div|span)\b((?:[^<>{}]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?)>/gs)]
    .filter((m) => /\bonClick\s*=/.test(m[1]) && !/\b(?:role|onKeyDown|tabIndex)\s*=/.test(m[1]))
    .map((m) => text.slice(0, m.index).split('\n').length);

function axeRule(repo) {
  const file = AXE_RESULTS.find((f) => repo.exists(f));
  if (!file)
    return skipped(
      'axe',
      'axe violations (e2e/ui/accessibility.spec.ts)',
      20,
      'not run: no recorded result (expected evidence/axe-results.json with { "violations": [...] })',
    );
  const { violations = [] } = JSON.parse(repo.read(file));
  return rule({
    id: 'axe',
    label: 'axe violations',
    weight: 20,
    value: violations.length,
    full: 5,
    details: top(violations.map((v) => `${v.id ?? v}: ${v.help ?? ''}`)),
  });
}

export function a11y(repo) {
  const gaps = parityGaps(repo);
  const inline = inlinePairs(repo);
  const baseline = repo.exists(INLINE_BASELINE) ? JSON.parse(repo.read(INLINE_BASELINE)) : {};
  const over = Object.entries(inline).filter(([file, n]) => n > (baseline[file] ?? 0));
  const total = Object.values(inline).reduce((n, v) => n + v, 0);
  const jsx = repo.files.filter((f) => JSX_FILE.test(f));
  const perFile = (find) =>
    jsx.flatMap((file) => find(repo.read(file)).map((line) => at(file, line)));
  const disabled = perFile(disabledWithoutReason);
  const images = perFile(imagesWithoutAlt);
  const clickable = perFile(clickableDivs);
  return [
    rule({
      id: 'locale-parity',
      label: 'Keys missing from one language of an en/zh table',
      weight: 25,
      value: gaps.length,
      full: 5,
      details: top(gaps.map((g) => g.message)),
    }),
    rule({
      id: 'inline-i18n',
      label: 'Inline bilingual strings that belong in the locale tables',
      weight: 20,
      value: total,
      full: 150,
      details: top(Object.entries(inline).map(([f, n]) => at(f, 1, `${n} inline pairs`))),
    }),
    rule({
      id: 'inline-i18n-regression',
      label: `Files above ${INLINE_BASELINE}`,
      weight: 10,
      value: over.length,
      full: 1,
      details: over.map(([f, n]) => at(f, 1, `${n} now, baseline ${baseline[f] ?? 0}`)),
    }),
    rule({
      id: 'disabled-reason',
      label: 'Disabled controls with no title or description saying why (heuristic)',
      weight: 10,
      value: disabled.length,
      full: 40,
      details: top(disabled),
    }),
    rule({
      id: 'img-alt',
      label: '<img> without alt',
      weight: 5,
      value: images.length,
      full: 5,
      details: top(images),
    }),
    rule({
      id: 'clickable-div',
      label: 'Clickable div or span with no role, key handler or tab stop (heuristic)',
      weight: 10,
      value: clickable.length,
      full: 20,
      details: top(clickable),
    }),
    axeRule(repo),
  ];
}
