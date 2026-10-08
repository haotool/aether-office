import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const node = process.execPath;
const score = resolve('scripts/quality/score.mjs');

describe('quality score CLI', () => {
  it('exits 2 with a clear message when --out is not writable', () => {
    let status = 0;
    let stderr = '';
    try {
      execFileSync(node, [score, '--release', '--out', '/dev/null/x/report.json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const e = err as { status?: number; stderr?: string };
      status = e.status ?? 1;
      stderr = e.stderr ?? '';
    }
    expect(status).toBe(2);
    expect(stderr).toMatch(/cannot write release report/i);
  });
});
