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
const { LIMITS, structure } = await loadQuality('areas/structure.mjs');
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

describe('L2-03 product fan-in', () => {
  it.each([
    ['tests/aether', 'apps/control/src/server.ts', 0],
    ['e2e', 'apps/control/src/server.ts', 0],
    ['scripts', 'apps/control/src/server.ts', 0],
    ['apps/web/src', 'e2e/support/sign-in.ts', 0],
    ['apps/web/src', 'apps/web/src/hub.ts', 1],
  ])('counts imports from %s to %s as %i violations', (from, target, expected) => {
    const runtime = new Map<string, Set<string>>();
    for (let i = 0; i <= LIMITS.fanIn; i += 1) runtime.set(`${from}/f${i}.ts`, new Set([target]));
    runtime.set('apps/control/src/main.ts', new Set([target]));
    const graph = { runtime, uses: [], reexportAll: new Map() };
    const repo = memoryRepo({ [target]: 'export const hub = 1;\n' });
    expect(fanIn(runtime).get(target)).toBe(LIMITS.fanIn + 2);
    expect(measureFanIn(graph).violations).toBe(expected);
    expect(
      structure(repo, { facts: [], graph }).find((rule: { id: string }) => rule.id === 'fan-in')
        .value,
    ).toBe(expected);
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
