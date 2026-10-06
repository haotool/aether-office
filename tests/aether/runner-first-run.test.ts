import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('a runner started before it is enrolled says what to do, not a stack trace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-runner-first-'));
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'apps/runner/src/main.ts'], {
    env: { ...process.env, AETHER_DATA_DIR: directory, AETHER_MODE: 'live' },
    encoding: 'utf8',
    timeout: 30000,
  });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain('runner:enroll');
  expect(run.stderr).not.toContain('at readFileSync');
});
