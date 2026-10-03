import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  assertClaudeVersion,
  assertCodexVersion,
  claudeRolloutVersion,
  codexRolloutVersion,
  codexVersion,
} from '../../packages/providers/src/compat.js';

describe('provider version policy', () => {
  it('accepts verified Codex releases and refuses anything else, including look-alikes', () => {
    expect(() => assertCodexVersion('codex-cli 0.159.2')).not.toThrow();
    expect(() => assertCodexVersion('codex-cli 0.160.0\n')).not.toThrow();
    for (const bad of [
      'codex-cli 0.161.0',
      'codex-cli 0.160.0-alpha.1',
      'codex-cli',
      'something 0.160.0',
      '',
    ])
      expect(() => assertCodexVersion(bad), bad).toThrow('CODEX_VERSION_UNVERIFIED');
    expect(codexVersion('codex-cli 0.160.0')).toBe('0.160.0');
  });

  it('accepts Claude Code patch releases of the verified series, and refuses other minor series', () => {
    for (const ok of ['2.1.286 (Claude Code)', '2.1.288 (Claude Code)', '2.1.999'])
      expect(() => assertClaudeVersion(ok), ok).not.toThrow();
    for (const bad of ['2.2.0 (Claude Code)', '3.0.0', '1.9.9', 'not a version', ''])
      expect(() => assertClaudeVersion(bad), bad).toThrow('CLAUDE_VERSION_UNVERIFIED');
  });

  it('applies the same lists to transcript files', () => {
    expect(codexRolloutVersion('0.160.0')).toBe(true);
    expect(codexRolloutVersion('0.130.0-alpha.5')).toBe(false);
    expect(claudeRolloutVersion('2.1.288')).toBe(true);
    expect(claudeRolloutVersion('2.0.5')).toBe(false);
  });

  // The adapters refuse an unverified CLI, so a check that only passes on synthetic strings would be worthless.
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
