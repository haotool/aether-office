import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { aetherDir } from '../../packages/providers/src/approval-config.mjs';
import {
  approvalScriptFiles,
  approvalScriptsDir,
} from '../../packages/providers/src/approval-install.js';

it('guard: tests resolve ~/.aether into a temporary AETHER_HOME, never the real one', () => {
  const real = join(homedir(), '.aether');
  expect(aetherDir()).not.toBe(real);
  expect(aetherDir().startsWith(tmpdir()) || aetherDir().startsWith('/private/')).toBe(true);
  expect(approvalScriptsDir().startsWith(aetherDir())).toBe(true);
  expect(approvalScriptFiles().every((f) => !f.startsWith(real))).toBe(true);
});

it('AETHER_HOME relocates the hook scripts; --dry-run lists what would be written and writes nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'aether-home-cli-'));
  const aether = join(home, 'elsewhere');
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'scripts/hooks.ts'), ...args],
      {
        cwd: home,
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', HOME: home, AETHER_HOME: aether },
      },
    );
  const dry = run('install', '--scope', 'user', '--remote-approvals', '--dry-run');
  expect(dry.status, dry.stderr).toBe(0);
  expect(dry.stdout).toContain('would write');
  expect(dry.stdout).toContain(join(aether, 'hooks', 'hook-approval.mjs'));
  expect(dry.stdout).toContain(join(home, '.claude', 'settings.json'));
  expect(existsSync(aether)).toBe(false);
  expect(existsSync(join(home, '.claude'))).toBe(false);

  const real = run('install', '--scope', 'user', '--remote-approvals');
  expect(real.status, real.stderr).toBe(0);
  expect(real.stdout).toContain(`writing:\n  ${join(home, '.claude', 'settings.json')}`);
  expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toContain(
    join(aether, 'hooks', 'hook-approval.mjs'),
  );
  expect(existsSync(join(home, '.aether'))).toBe(false);
}, 60000);

it('an install that cannot write ends with one sentence and exit 1, not a stack trace', () => {
  const script = join(process.cwd(), 'scripts/hooks.ts');
  const run = spawnSync(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), script, 'install', '--project', '/nonexistent/aether'],
    { encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '' } },
  );
  expect(run.status).toBe(1);
  expect(run.stderr).toMatch(/^hooks install failed: /m);
  expect(run.stderr).not.toContain('    at ');
}, 60000);
