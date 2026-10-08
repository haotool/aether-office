import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assertClaudeVersion,
  assertCodexVersion,
  claudeRolloutVersion,
  codexRolloutVersion,
  codexVersion,
} from '../../packages/providers/src/compat.js';

const writeFixtureCli = (dir: string, name: string, versionLine: string) => {
  const bin = join(dir, name);
  writeFileSync(bin, `#!${process.execPath}\nconsole.log(${JSON.stringify(versionLine)});\n`);
  chmodSync(bin, 0o700);
  return bin;
};

const spawnVersion = (name: string, binDir: string) =>
  spawnSync(name, ['--version'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}${delimiter}${process.env['PATH'] ?? ''}` },
  });

describe('provider version policy', () => {
  it('accepts verified Codex releases and refuses anything else, including look-alikes', () => {
    expect(() => assertCodexVersion('codex-cli 0.159.2')).not.toThrow();
    expect(() => assertCodexVersion('codex-cli 0.160.0\n')).not.toThrow();
    for (const bad of [
      'codex-cli 0.161.0',
      'codex-cli 0.160.10',
      'codex-cli 0.159.20',
      'codex-cli 0.16.0',
      'codex-cli 0.160.0-alpha.1',
      'codex-cli',
      'something 0.160.0',
      '',
    ])
      expect(() => assertCodexVersion(bad), bad).toThrow('CODEX_VERSION_UNVERIFIED');
    expect(codexVersion('codex-cli 0.160.0')).toBe('0.160.0');
  });

  it('accepts Claude Code patch releases of the verified series, and refuses other minor series', () => {
    for (const ok of [
      '2.1.286 (Claude Code)',
      '2.1.288 (Claude Code)',
      '2.1.5 (Claude Code)',
      '2.1.999',
    ])
      expect(() => assertClaudeVersion(ok), ok).not.toThrow();
    for (const bad of [
      '2.2.0 (Claude Code)',
      '2.10.0 (Claude Code)',
      '2.1',
      '21.0.0',
      '3.0.0',
      '1.9.9',
      'not a version',
      '',
    ])
      expect(() => assertClaudeVersion(bad), bad).toThrow('CLAUDE_VERSION_UNVERIFIED');
  });

  it('applies the same lists to transcript files', () => {
    expect(codexRolloutVersion('0.160.0')).toBe(true);
    expect(codexRolloutVersion('0.130.0-alpha.5')).toBe(false);
    expect(claudeRolloutVersion('2.1.288')).toBe(true);
    expect(claudeRolloutVersion('2.0.5')).toBe(false);
  });
});

describe('fixture provider CLIs (--version)', () => {
  const binDirs: string[] = [];

  afterAll(() => {
    for (const dir of binDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('codex fixture with a verified release passes the adapter version check', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aether-provider-compat-'));
    binDirs.push(binDir);
    writeFixtureCli(binDir, 'codex', 'codex-cli 0.160.0');
    const real = spawnVersion('codex', binDir);
    expect(real.status).toBe(0);
    expect(() => assertCodexVersion(real.stdout.trim())).not.toThrow();
  });

  it('codex fixture with an unverified release is refused like the adapter', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aether-provider-compat-'));
    binDirs.push(binDir);
    writeFixtureCli(binDir, 'codex', 'codex-cli 0.161.0');
    const real = spawnVersion('codex', binDir);
    expect(real.status).toBe(0);
    expect(() => assertCodexVersion(real.stdout.trim())).toThrow('CODEX_VERSION_UNVERIFIED');
  });

  it('claude fixture with a verified release passes the adapter version check', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aether-provider-compat-'));
    binDirs.push(binDir);
    writeFixtureCli(binDir, 'claude', '2.1.288 (Claude Code)');
    const real = spawnVersion('claude', binDir);
    expect(real.status).toBe(0);
    expect(() => assertClaudeVersion(real.stdout.trim())).not.toThrow();
  });

  it('claude fixture with an unverified release is refused like the adapter', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'aether-provider-compat-'));
    binDirs.push(binDir);
    writeFixtureCli(binDir, 'claude', '2.2.0 (Claude Code)');
    const real = spawnVersion('claude', binDir);
    expect(real.status).toBe(0);
    expect(() => assertClaudeVersion(real.stdout.trim())).toThrow('CLAUDE_VERSION_UNVERIFIED');
  });

  it.each([
    ['codex', 'codex-cli 0.160.10'],
    ['codex', 'codex-cli 0.159.20'],
    ['codex', 'codex-cli 0.16.0'],
  ] as const)('%s fixture near-miss %s is refused', (name, versionLine) => {
    const binDir = mkdtempSync(join(tmpdir(), 'aether-provider-compat-'));
    binDirs.push(binDir);
    writeFixtureCli(binDir, name, versionLine);
    const real = spawnVersion(name, binDir);
    expect(real.status).toBe(0);
    expect(() => assertCodexVersion(real.stdout.trim())).toThrow('CODEX_VERSION_UNVERIFIED');
  });

  it.each([
    ['claude', '2.10.0 (Claude Code)'],
    ['claude', '2.1'],
    ['claude', '21.0.0 (Claude Code)'],
  ] as const)('%s fixture near-miss %s is refused', (name, versionLine) => {
    const binDir = mkdtempSync(join(tmpdir(), 'aether-provider-compat-'));
    binDirs.push(binDir);
    writeFixtureCli(binDir, name, versionLine);
    const real = spawnVersion(name, binDir);
    expect(real.status).toBe(0);
    expect(() => assertClaudeVersion(real.stdout.trim())).toThrow('CLAUDE_VERSION_UNVERIFIED');
  });
});
