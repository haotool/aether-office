import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

/**
 * Wording belongs in the locale tables (apps/web/src/locales) so a third language is a table, not a hunt through the code.
 * A bilingual ternary on a string (`zh ? '今天' : 'Today'`) is an inline pair; this test counts them per file and fails when
 * a file has more than the baseline below. The baseline only ever shrinks: move the wording into the tables, then lower the count.
 */
const ROOTS = ['apps/web/src', 'packages/office-scene/src'];
const INLINE = /(?:\b(?:zh|en|isZh|isEn)\b|\b(?:locale|lang)\s*===\s*'(?:zh-TW|en)')\s*\?\s*[`'"]/g;

const BASELINE = JSON.parse(
  readFileSync(new URL('./inline-i18n-baseline.json', import.meta.url), 'utf8'),
) as Record<string, number>;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'locales' || e.name === 'dist' ? [] : sources(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

const inlinePairs = (): Record<string, number> =>
  Object.fromEntries(
    ROOTS.flatMap(sources)
      .map((file) => [relative('.', file), (readFileSync(file, 'utf8').match(INLINE) ?? []).length])
      .filter(([, n]) => (n as number) > 0),
  );

it('adds no inline bilingual strings beyond the baseline', () => {
  const found = inlinePairs();
  const over = Object.entries(found).filter(([file, n]) => n > (BASELINE[file] ?? 0));
  expect(over).toEqual([]);
});

it('keeps the baseline honest: a file that has been cleaned up leaves it', () => {
  const found = inlinePairs();
  const stale = Object.entries(BASELINE).filter(([file, n]) => (found[file] ?? 0) < n);
  expect(stale).toEqual([]);
});
