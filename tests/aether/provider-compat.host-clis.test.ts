import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { assertClaudeVersion, assertCodexVersion } from '../../packages/providers/src/compat.js';

// Opt-in drift alarm: default `pnpm test` never calls installed provider binaries.
describe.runIf(process.env['AETHER_HOST_CLIS'] === '1')('installed host provider CLIs', () => {
  for (const [name, args, assertion] of [
    ['codex', ['--version'], assertCodexVersion],
    ['claude', ['--version'], assertClaudeVersion],
  ] as const) {
    const real = spawnSync(name, args, { encoding: 'utf8' });
    it.skipIf(real.status !== 0)(
      `the installed ${name} CLI passes the version check the adapter will apply`,
      () => {
        expect(() => assertion(real.stdout.trim())).not.toThrow();
      },
    );
  }
});
