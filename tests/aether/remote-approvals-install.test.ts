import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installHooks,
  installHooksFile,
  removeHooks,
  removeHooksFile,
} from '../../packages/providers/src/claude-hooks.js';
import {
  approvalScriptsStatus,
  installApprovalScripts,
} from '../../packages/providers/src/approval-install.js';
import { fileHookStatus, fileRemoteApprovals } from '../../packages/providers/src/hook-status.js';

const script = '/opt/aether/hook.mjs';
const approvals = { script: '/opt/aether/approval.mjs' };
const node = '/usr/bin/node';
const user = {
  model: 'x',
  hooks: { PermissionRequest: [{ hooks: [{ type: 'command', command: 'user-gate' }] }] },
};

it('Remote approvals adds one synchronous PermissionRequest hook, only on request, and every path removes it', async () => {
  const off = installHooks(user, script);
  expect(JSON.stringify(off)).not.toContain('approval.mjs');
  const on = installHooks(user, script, undefined, 'claude', node, approvals);
  const sync = (on.hooks?.PermissionRequest ?? [])
    .flatMap((g) => g.hooks ?? [])
    .filter((c) => String(c.command).includes('approval.mjs'));
  expect(sync).toHaveLength(1);
  expect(sync[0]).toMatchObject({ type: 'command', timeout: 60 });
  expect(sync[0]).not.toHaveProperty('async');
  expect(sync[0]!.command).toBe(
    '"/usr/bin/node" "/opt/aether/approval.mjs" 45000 # aether-office-hook:PermissionRequest:wait',
  );
  expect(installHooks(on, script, undefined, 'claude', node, approvals)).toEqual(on);
  expect(installHooks(on, script, undefined, 'claude', node)).toEqual(
    installHooks(user, script, undefined, 'claude', node),
  );
  expect(removeHooks(on)).toEqual(user);
  expect(
    JSON.stringify(installHooks({}, script, undefined, 'codex', node, approvals)),
  ).not.toContain('approval.mjs');
  expect(() =>
    installHooks({}, script, undefined, 'claude', node, { ...approvals, waitSeconds: 1 }),
  ).toThrow('APPROVAL_WAIT_INVALID');
  expect(() => installHooks({}, script, undefined, 'claude', node, { script: 'rel.mjs' })).toThrow(
    'HOOK_SCRIPT_INVALID',
  );

  // Against a temporary home only, never the real one.
  const dir = await mkdtemp(join(tmpdir(), 'aether-approvals-hooks-'));
  const file = join(dir, 'settings.json');
  await installHooksFile(file, script, undefined, 'claude', approvals);
  expect(await fileRemoteApprovals(file)).toBe(true);
  await installHooksFile(file, script);
  expect(await fileHookStatus(file, 'claude')).toMatchObject({ state: 'installed' });
  expect(await fileRemoteApprovals(file)).toBe(false);
  await removeHooksFile(file);
  expect((await fileHookStatus(file, 'claude')).state).toBe('not_installed');
});

const providers = join(process.cwd(), 'packages/providers/src');

it('installs the hook into a private copy outside the worktree, and reports a changed copy as modified', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-approval-home-'));
  const dot = join(home, '.aether');
  await mkdir(dot, { mode: 0o755 });
  await chmod(dot, 0o755);
  const dir = join(dot, 'hooks');
  expect(await approvalScriptsStatus(dir)).toBe('missing');
  const hook = await installApprovalScripts(dir);
  expect(hook).toBe(join(dir, 'hook-approval.mjs'));
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  for (const name of ['hook-approval.mjs', 'approval-config.mjs']) {
    expect((await stat(join(dir, name))).mode & 0o777).toBe(0o500);
    expect(await readFile(join(dir, name), 'utf8')).toBe(
      await readFile(join(providers, name), 'utf8'),
    );
  }
  expect(await approvalScriptsStatus(dir)).toBe('installed');

  await chmod(join(dir, 'approval-config.mjs'), 0o700);
  await writeFile(join(dir, 'approval-config.mjs'), 'export {}');
  expect(await approvalScriptsStatus(dir)).toBe('modified');
  await installApprovalScripts(dir);
  expect(await approvalScriptsStatus(dir)).toBe('installed');
  expect((await stat(join(dir, 'approval-config.mjs'))).mode & 0o777).toBe(0o500);

  const elsewhere = await mkdtemp(join(tmpdir(), 'aether-approval-elsewhere-'));
  await symlink(elsewhere, join(dot, 'linked'));
  await expect(installApprovalScripts(join(dot, 'linked'))).rejects.toThrow('APPROVAL_DIR_LINKED');
  expect(await readdir(elsewhere)).toEqual([]);
});

it('`pnpm hooks install --remote-approvals` points settings at the private copy and status reports a modified one', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-approval-cli-'));
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), join(process.cwd(), 'scripts/hooks.ts'), ...args],
      { cwd: home, encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', HOME: home } },
    );
  const installed = run('install', '--scope', 'user', '--remote-approvals');
  expect(installed.status, installed.stderr).toBe(0);
  const settings = await readFile(join(home, '.claude', 'settings.json'), 'utf8');
  expect(settings).toContain(join(home, '.aether', 'hooks', 'hook-approval.mjs'));
  expect(run('status', '--scope', 'user').stdout).toContain('remote approvals scripts: installed');
  const copy = join(home, '.aether', 'hooks', 'hook-approval.mjs');
  await chmod(copy, 0o700);
  await writeFile(copy, '// edited');
  expect(run('status', '--scope', 'user').stdout).toContain('remote approvals scripts: modified');
}, 60000);

it('writes settings.json through a symlink, so a dotfiles link survives', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-settings-link-'));
  const real = join(dir, 'dotfiles-settings.json');
  const link = join(dir, 'settings.json');
  await writeFile(real, `${JSON.stringify(user)}\n`);
  await symlink(real, link);
  await installHooksFile(link, script);
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
  expect(JSON.parse(await readFile(real, 'utf8')).hooks.Stop).toHaveLength(1);
  await removeHooksFile(link);
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
  expect(JSON.parse(await readFile(real, 'utf8'))).toEqual(user);
});
