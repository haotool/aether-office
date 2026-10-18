import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertClaudeVersion,
  assertCodexVersion,
  claudeRolloutVersion,
  codexRolloutVersion,
  codexVersion,
} from '../../packages/providers/src/compat.js';

const versions = [
  '0.159.2',
  '0.163.0',
  '0.999.0',
  '3.0.0',
  '999.0.0',
  '0.130.0-alpha.5',
  '4.0.0-beta.1+build.7',
];

describe('provider version syntax, independent of release lists', () => {
  it.each(versions)('accepts %s in both CLI probes and transcript metadata', (version) => {
    expect(() => assertCodexVersion(`codex-cli ${version}`)).not.toThrow();
    expect(() => assertClaudeVersion(`${version} (Claude Code)`)).not.toThrow();
    expect(() => assertClaudeVersion(version)).not.toThrow();
    expect(codexRolloutVersion(version)).toBe(true);
    expect(claudeRolloutVersion(version)).toBe(true);
    expect(codexVersion(`codex-cli ${version}\n`)).toBe(version);
  });

  it.each(['', 'unknown', '2.1', '2.1.3 extra', '2.1.3\n999.0.0', '2.1.3-', '2.1.3+'])(
    'refuses malformed metadata %j',
    (version) => {
      expect(codexRolloutVersion(version)).toBe(false);
      expect(claudeRolloutVersion(version)).toBe(false);
      expect(() => assertCodexVersion(`codex-cli ${version}`)).toThrow();
      expect(() => assertClaudeVersion(version)).toThrow();
    },
  );

  it('does not mistake another executable output for a provider CLI', () => {
    expect(() => assertCodexVersion('something 0.163.0')).toThrow();
    expect(() => assertClaudeVersion('3.0.0 (Other CLI)')).toThrow();
  });
});

it.each([
  ['codex', 'codex-cli 0.163.0', assertCodexVersion],
  ['codex', 'codex-cli 999.0.0-alpha.1', assertCodexVersion],
  ['claude', '3.0.0 (Claude Code)', assertClaudeVersion],
] as const)(
  'accepts the %s fixture CLI output %s without a repository update',
  (name, output, check) => {
    const dir = mkdtempSync(join(tmpdir(), 'aether-provider-compat-'));
    try {
      const bin = join(dir, name);
      writeFileSync(bin, `#!${process.execPath}\nconsole.log(${JSON.stringify(output)});\n`);
      chmodSync(bin, 0o700);
      const result = spawnSync(bin, ['--version'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(() => check(result.stdout.trim())).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
