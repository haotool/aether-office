import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = (name: string) => import(pathToFileURL(resolve('scripts/quality/release', name)).href);

describe('release compute', () => {
  it('caps layer score at 80 when a G gate fails', async () => {
    const { layerResult } = await load('compute.mjs');
    const ids = ['L1-G', ...Array.from({ length: 9 }, (_, i) => `L1-M${i}`)];
    const byId = Object.fromEntries(
      ids.map((id) => [
        id,
        { type: id === 'L1-G' ? 'G' : 'M', credit: id === 'L1-G' ? 0 : 1, status: 'measured' },
      ]),
    );
    const r = layerResult('L1', ids, byId);
    expect(r.gFailed).toBe(true);
    expect(r.score).toBe(80);
  });

  it('marks L7 git criteria unmeasured when rev-parse fails', async () => {
    const { scoreRelease } = await load('run.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'quality-no-git-'));
    try {
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, include: [] }),
      );
      const report = await scoreRelease(dir);
      const l703 = report.criteria.find((c: { id: string }) => c.id === 'L7-03');
      const l704 = report.criteria.find((c: { id: string }) => c.id === 'L7-04');
      expect(l703?.status).toBe('unmeasured');
      expect(l704?.status).toBe('unmeasured');
      expect(String(l703?.detail?.[0] ?? '')).toMatch(/git rev-parse failed/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
