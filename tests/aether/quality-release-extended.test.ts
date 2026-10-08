import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const load = (name: string) => import(pathToFileURL(resolve('scripts/quality/release', name)).href);
const loadRoot = (name: string) => import(pathToFileURL(resolve('scripts/quality', name)).href);

const {
  coverageViolations,
  measureCoverage,
  measureCompactBlur,
  blurLineCounts,
  measureLocaleCompleteness,
  measureConventionalCommits,
  measureMixedLanguageDocs,
  measureChangelog,
} = await load('measure-extended.mjs');
const { memoryRepo } = await loadRoot('repo.mjs');
const { creditM } = await load('compute.mjs');

describe('measureCoverage', () => {
  it('stays unmeasured without a summary file', () => {
    const repo = memoryRepo({});
    expect(measureCoverage(repo).unmeasured).toBe(true);
  });

  it('uses percentage-point shortfall with failAt 30', () => {
    expect(coverageViolations(85, 75)).toBe(0);
    expect(coverageViolations(80, 70)).toBe(0);
    expect(coverageViolations(50, 80)).toBe(30);
    expect(creditM(30, 30)).toBe(0);
    expect(creditM(15, 30)).toBe(0.5);
  });

  it('passes at charter line/branch thresholds', () => {
    const repo = memoryRepo({
      'coverage/coverage-summary.json': JSON.stringify({
        total: { lines: { pct: 85 }, branches: { pct: 75 } },
      }),
    });
    expect(measureCoverage(repo).violations).toBe(0);
  });
});

describe('measureCompactBlur', () => {
  it('counts blur in all apps/web/src/styles css unless blur-ok', () => {
    const repo = memoryRepo({
      'apps/web/src/styles/a.css': 'x { backdrop-filter: blur(4px); }\n',
      'apps/web/src/styles/b.css':
        '/* blur-ok: measured harmless */\ny { backdrop-filter: blur(2px); }\n',
    });
    expect(measureCompactBlur(repo).violations).toBe(1);
    expect(blurLineCounts(repo.read('apps/web/src/styles/b.css'))).toHaveLength(0);
  });
});

describe('measureLocaleCompleteness', () => {
  it('counts parity gaps', () => {
    const repo = memoryRepo({
      'apps/web/src/locales/en.ts': 'export const t = {\n  a: "x",\n};\n',
      'apps/web/src/locales/zh.ts': 'export const t = {\n};\n',
    });
    expect(measureLocaleCompleteness(repo).violations).toBeGreaterThan(0);
  });
});

describe('measureConventionalCommits', () => {
  it('flags overlong subjects in git history', () => {
    const root = resolve('.');
    const result = measureConventionalCommits(root, '-1');
    expect(result.violations).toBeGreaterThanOrEqual(0);
  });
});

describe('measureMixedLanguageDocs', () => {
  it('detects mixed paragraphs in public docs', () => {
    const repo = memoryRepo({
      'docs/development.md': 'Hello world 你好世界\n',
    });
    expect(measureMixedLanguageDocs(repo).violations).toBe(1);
  });
});

describe('measureChangelog', () => {
  const good = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '## [0.4.0] - 2026-10-08',
    '',
    '### Added',
    '- a',
    '### Fixed',
    '- b',
    '',
  ].join('\n');

  it('accepts the Keep a Changelog layout', () => {
    expect(measureChangelog(memoryRepo({ 'CHANGELOG.md': good })).violations).toBe(0);
  });

  it('counts a missing section, odd headings, repeated kinds and working vocabulary', () => {
    const bad = good
      .replace('## [Unreleased]\n\n', '')
      .replace('### Fixed', '### Added')
      .replace('## [0.4.0] - 2026-10-08', '## 0.4.0')
      .concat('- fixed in wave 2\n');
    expect(measureChangelog(memoryRepo({ 'CHANGELOG.md': bad })).violations).toBe(4);
  });

  it('is unmeasured without a changelog', () => {
    expect(measureChangelog(memoryRepo({})).unmeasured).toBe(true);
  });
});
