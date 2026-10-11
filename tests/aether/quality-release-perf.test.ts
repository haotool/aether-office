import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const load = (name: string) => import(pathToFileURL(resolve(name)).href);
const { measureColdStart, measureSceneBudget, measureSoak } = await load(
  'scripts/quality/release/measure-perf.mjs',
);
const { writeRecord } = await load('scripts/mobile-perf/record.mjs');
const { CODE_PATHS } = await load('scripts/ux-matrix-summary.mjs');

const root = mkdtempSync(join(tmpdir(), 'aether-perf-record-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
const commit = (message: string) => {
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-m', message);
};

const GOOD = {
  scene: { drawCalls: 80, triangles: 120_000, gpuMegabytes: 40, webglContexts: 1 },
  coldStart: { transferBytes: 2 * 1024 * 1024 },
  soak: { minutes: 10, heapMegabytes: [40, 41], growthPct: 4 },
};

describe('the mobile performance record', () => {
  it('is unmeasured while the record is missing', () => {
    git('init', '-b', 'main');
    for (const p of CODE_PATHS as string[]) {
      mkdirSync(join(root, p), { recursive: true });
      writeFileSync(join(root, p, 'index.ts'), 'export {};\n');
    }
    mkdirSync(join(root, 'docs/verification'), { recursive: true });
    commit('chore: code');
    expect(measureSceneBudget(root)).toMatchObject({ unmeasured: true });
  });

  it('counts the scene budgets that are broken', () => {
    writeRecord(root, GOOD);
    expect(measureSceneBudget(root)).toMatchObject({ violations: 0 });
    writeRecord(root, {
      ...GOOD,
      scene: { drawCalls: 180, triangles: 120_000, gpuMegabytes: 40, webglContexts: 2 },
    });
    expect(measureSceneBudget(root)).toMatchObject({ violations: 2 });
  });

  it('charges every 100 KB of a cold start over 3 MB', () => {
    writeRecord(root, { ...GOOD, coldStart: { transferBytes: 3 * 1024 * 1024 + 150 * 1024 } });
    expect(measureColdStart(root)).toMatchObject({ violations: 2 });
    writeRecord(root, GOOD);
    expect(measureColdStart(root)).toMatchObject({ violations: 0, value: 2048 });
  });

  it('charges every point of heap growth over 10% and wants a 10 minute soak', () => {
    writeRecord(root, { ...GOOD, soak: { minutes: 10, heapMegabytes: [], growthPct: 12.4 } });
    expect(measureSoak(root)).toMatchObject({ violations: 3 });
    writeRecord(root, { ...GOOD, soak: { minutes: 2, heapMegabytes: [], growthPct: 0 } });
    expect(measureSoak(root)).toMatchObject({ unmeasured: true });
  });

  it('goes stale when the measured code changes', () => {
    writeRecord(root, GOOD);
    writeFileSync(join(root, 'apps/web/index.ts'), 'export const changed = 1;\n');
    commit('fix: change the web app');
    expect(measureSoak(root)).toMatchObject({
      unmeasured: true,
      detail: [expect.stringContaining('stale for apps/web'), expect.any(String)],
    });
  });
});
