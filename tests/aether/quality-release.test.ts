import { describe, expect, it } from 'vitest';
import { unlinkSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const load = (name: string) => import(pathToFileURL(resolve('scripts/quality/release', name)).href);
const loadRoot = (name: string) => import(pathToFileURL(resolve('scripts/quality', name)).href);

const { creditM, measuredRow, releasePass } = await load('compute.mjs');
const {
  measureResiduePaths,
  measureFileLines,
  measureDirFileCount,
  measureDeadCode,
  isAmbientTypeReference,
  RESIDUE_PATTERNS,
} = await load('measure.mjs');
const { memoryRepo, diskRepo } = await loadRoot('repo.mjs');
const { measureCognitive } = await load('measure.mjs');
const { scoreRelease } = await load('run.mjs');
const { EVIDENCE_PATH } = await load('evidence.mjs');

describe('release creditM', () => {
  it('passes at zero violations', () => {
    expect(creditM(0, 10)).toBe(1);
  });

  it('fails at failAt violations', () => {
    expect(creditM(10, 10)).toBe(0);
  });

  it('is proportional at the boundary', () => {
    expect(creditM(5, 10)).toBe(0.5);
  });
});

describe('release measuredRow', () => {
  it('gives full credit to a clean M criterion', () => {
    const row = measuredRow('L2-02', { violations: 0, source: 'test', detail: [] });
    expect(row.credit).toBe(1);
    expect(row.status).toBe('measured');
  });
});

describe('release pass gate', () => {
  it('fails when unmeasured remain', () => {
    expect(
      releasePass({
        overall: 99,
        layers: { L1: 99 },
        unmeasured: 2,
        gates: {},
      }),
    ).toBe(false);
  });
});

describe('residue path naming', () => {
  it('flags known process paths and skips domain exceptions', () => {
    const repo = memoryRepo({
      'docs/design/office-life-iterations-shadow.md': '# x',
      'e2e/office-life/office-life-scene-preview.spec.ts': 'test',
      'packages/office-scene/src/life/registry-command-outcomes.ts': 'export {}',
      'scripts/final-verification-shadow.ts': 'export {}',
      'apps/control/src/services/platform/oldest-entry.ts': 'export {}',
    });
    const { violations, detail } = measureResiduePaths(repo);
    expect(violations).toBe(2);
    expect(detail.some((d: string) => d.includes('oldest-entry'))).toBe(false);
    expect(RESIDUE_PATTERNS.length).toBeGreaterThan(5);
  });
});

describe('directory file count', () => {
  it('counts only non-test non-generated directories', () => {
    const files = Array.from({ length: 41 }, (_, i) => `apps/web/src/f${i}.ts`);
    files.push('apps/web/src/generated/x.ts', 'tests/aether/a.test.ts');
    const repo = memoryRepo(Object.fromEntries(files.map((f) => [f, 'export {}'])));
    const { violations } = measureDirFileCount(repo);
    expect(violations).toBe(1);
  });
});

describe('file line stats', () => {
  it('adds violations when median and p95 exceed charter limits', () => {
    const repo = memoryRepo({
      'apps/web/src/a.ts': `${'//\n'.repeat(400)}export {}`,
      'apps/web/src/b.ts': `${'//\n'.repeat(10)}export {}`,
    });
    const { violations } = measureFileLines(repo);
    expect(violations).toBeGreaterThan(0);
  });
});

describe('release evidence file errors', () => {
  it('keeps E/H unmeasured and surfaces malformed JSON without throwing', async () => {
    const root = resolve('.');
    const repo = diskRepo(root);
    const original = repo.exists(EVIDENCE_PATH) ? repo.read(EVIDENCE_PATH) : null;
    try {
      writeFileSync(resolve(root, EVIDENCE_PATH), '{ broken');
      const report = await scoreRelease(root);
      expect(report.evidenceError).toMatch(/invalid JSON/);
      type Row = { type: string; status: string; detail: string[] };
      const eh = report.criteria.filter((c: Row) => c.type === 'E' || c.type === 'H');
      expect(eh.every((c: Row) => c.status === 'unmeasured')).toBe(true);
      expect(eh.every((c: Row) => c.detail[0]?.includes('criteria evidence unavailable'))).toBe(
        true,
      );
      expect(report.pass).toBe(false);
    } finally {
      if (original === null) unlinkSync(resolve(root, EVIDENCE_PATH));
      else writeFileSync(resolve(root, EVIDENCE_PATH), original);
    }
  }, 60_000);
});

describe('measureCognitive', () => {
  it('passes when no function exceeds the limit', () => {
    const facts = [
      {
        file: 'apps/web/src/a.ts',
        functions: [{ name: 'f', line: 1, cognitive: 5, length: 10, nesting: 1 }],
      },
    ];
    expect(measureCognitive(facts).violations).toBe(0);
  });

  it('fails for high complexity and respects the boundary at 15', () => {
    const facts = [
      {
        file: 'apps/web/src/a.ts',
        functions: [
          { name: 'ok', line: 1, cognitive: 15, length: 10, nesting: 1 },
          { name: 'bad', line: 20, cognitive: 16, length: 10, nesting: 1 },
        ],
      },
    ];
    expect(measureCognitive(facts).violations).toBe(1);
  });
});

describe('ambient env declarations', () => {
  it('recognises a triple-slash reference d.ts as not an orphan module', () => {
    const text = '/// <reference types="vite/client" />\n';
    expect(isAmbientTypeReference('apps/web/src/env.d.ts', text)).toBe(true);
    const repo = memoryRepo({ 'apps/web/src/env.d.ts': text, 'apps/web/src/app.ts': 'export {}' });
    const facts = [
      { file: 'apps/web/src/env.d.ts', functions: [], exports: [] },
      { file: 'apps/web/src/app.ts', functions: [], exports: [{ name: 'default', line: 1 }] },
    ];
    const graph = {
      uses: [],
      runtime: new Map([['apps/web/src/main.tsx', ['apps/web/src/app.ts']]]),
    };
    expect(measureDeadCode(repo, facts, graph).violations).toBe(0);
  });
});
