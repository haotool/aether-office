import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const loadRelease = (name: string) =>
  import(pathToFileURL(resolve('scripts/quality/release', name)).href);
const loadQuality = (name: string) => import(pathToFileURL(resolve('scripts/quality', name)).href);

const { measureFanIn, measureRootItems } = await loadRelease('measure.mjs');
const { listRootItems } = await loadRelease('root-items.mjs');
const { qualityInputs, formatQualityInputs } = await loadQuality('inputs.mjs');
const { memoryRepo } = await loadQuality('repo.mjs');
const { fanIn } = await loadQuality('graph.mjs');
const { LIMITS } = await loadQuality('areas/structure.mjs');
const { fanInExcludedTarget } = await loadQuality('lib.mjs');
const { scoreRepository } = await loadQuality('run.mjs');
const { renderTable } = await loadQuality('render.mjs');
const { parseFloors } = await loadQuality('floors.mjs');

describe('L7-04 release tree root items', () => {
  it('ignores gitignored top-level directories in a git work tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'aether-root-'));
    try {
      execFileSync('git', ['init'], { cwd: root });
      writeFileSync(join(root, 'README.md'), '# x\n');
      writeFileSync(join(root, '.gitignore'), 'ignored-dir/\n');
      mkdirSync(join(root, 'ignored-dir'));
      writeFileSync(join(root, 'ignored-dir', 'blob'), 'x');
      writeFileSync(join(root, 'tracked.txt'), 'y');
      const items = listRootItems(root);
      expect(items).toContain('README.md');
      expect(items).toContain('tracked.txt');
      expect(items).not.toContain('ignored-dir');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('measureRootItems uses git ls-files in a work tree (not raw readdir)', () => {
    const root = mkdtempSync(join(tmpdir(), 'aether-root-git-'));
    try {
      execFileSync('git', ['init'], { cwd: root });
      writeFileSync(join(root, 'tracked.txt'), 'y');
      execFileSync('git', ['add', 'tracked.txt'], { cwd: root });
      const { value } = measureRootItems(root);
      expect(value).toBe(1);
      expect(listRootItems(root)).toEqual(['tracked.txt']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('L2-03 fan-in test support exclusion', () => {
  it('does not count e2e/support or tests paths as violations', () => {
    const runtime = new Map<string, Set<string>>();
    for (let i = 0; i < 40; i += 1)
      runtime.set(`e2e/spec-${i}.ts`, new Set(['e2e/support/sign-in.ts']));
    runtime.set('apps/web/src/a.ts', new Set(['apps/web/src/b.ts']));
    const { violations, detail } = measureFanIn({ runtime, uses: [] });
    expect(fanInExcludedTarget('e2e/support/sign-in.ts')).toBe(true);
    expect(fanIn(runtime).get('e2e/support/sign-in.ts')).toBe(40);
    expect(violations).toBe(0);
    expect(detail.some((d: string) => d.includes('sign-in'))).toBe(false);
  });

  it('still flags product modules above the fan-in limit', () => {
    const runtime = new Map<string, Set<string>>();
    for (let i = 0; i < LIMITS.fanIn + 1; i += 1)
      runtime.set(`apps/web/src/f${i}.ts`, new Set(['apps/web/src/hub.ts']));
    expect(measureFanIn({ runtime, uses: [] }).violations).toBe(1);
  });
});

describe('quality score inputs', () => {
  it('reports absent role-variance when no result file exists', () => {
    const repo = memoryRepo({ 'apps/web/src/a.ts': 'export {}' });
    expect(qualityInputs(repo)).toEqual({ 'role-variance': 'absent' });
  });

  it('reports present with a content hash when a result file exists', () => {
    const repo = memoryRepo({
      'evidence/role-variance.json': '{"violations":[]}',
    });
    expect(qualityInputs(repo)['role-variance']).toMatch(/^present sha256:[0-9a-f]{8}$/);
  });

  it('includes inputs in JSON and text output', async () => {
    const root = resolve('.');
    const report = await scoreRepository(root, ['ui']);
    expect(report.inputs?.['role-variance']).toMatch(/^(absent|present sha256:[0-9a-f]{8})$/);
    const floors = parseFloors('{"target":95,"floors":{}}');
    const text = renderTable(report, floors, { brief: true });
    expect(text).toContain(`inputs: ${formatQualityInputs(report.inputs!)}`);
  });
});
