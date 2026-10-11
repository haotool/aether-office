import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HOOK_EVENTS,
  installHooks,
  installHooksFile,
  removeHooks,
  removeHooksFile,
} from '../../packages/providers/src/claude-hooks.js';

const script = '/opt/aether/hook.mjs';
const user = {
  model: 'x',
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user' }] }],
    Notification: [{ hooks: [{ type: 'command', command: 'notify' }] }],
  },
};

it('install is idempotent, keeps user hooks, and remove restores the original exactly', () => {
  const once = installHooks(user, script);
  const twice = installHooks(once, script);
  expect(twice).toEqual(once);
  expect(once.hooks?.PreToolUse?.[0]).toEqual(user.hooks.PreToolUse[0]);
  expect(Object.keys(once.hooks ?? {})).toEqual(
    expect.arrayContaining([...HOOK_EVENTS, 'Notification']),
  );
  expect(removeHooks(once)).toEqual(user);
  expect(removeHooks(installHooks({}, script))).toEqual({});
});

it('update replaces our script path, never duplicates', () => {
  const next = installHooks(installHooks(user, script), '/new/hook.mjs');
  expect(JSON.stringify(next)).not.toContain(script);
  expect(next.hooks?.Stop).toHaveLength(1);
});

it('rejects relative or shell-metacharacter script paths', () => {
  expect(() => installHooks({}, 'hook.mjs')).toThrow('HOOK_SCRIPT_INVALID');
  expect(() => installHooks({}, '/a/$(x).mjs')).toThrow('HOOK_SCRIPT_INVALID');
});

it('file round-trip: atomic write, pristine backup kept, unparseable file refused untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-hooks-'));
  const file = join(dir, 'settings.json');
  const original = `${JSON.stringify(user, null, 2)}\n`;
  await writeFile(file, original);
  await installHooksFile(file, script);
  await installHooksFile(file, script);
  expect(await readFile(`${file}.aether-backup`, 'utf8')).toBe(original);
  await removeHooksFile(file);
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(user);
  await writeFile(file, '{ not json');
  await expect(installHooksFile(file, script)).rejects.toThrow('SETTINGS_NOT_JSON');
  expect(await readFile(file, 'utf8')).toBe('{ not json');
  await installHooksFile(join(dir, 'new', 'settings.json'), script);
});

it('installs for Codex after existing hooks, so their positions (and any trust recorded for them) are unchanged', () => {
  const existing = {
    hooks: {
      SessionStart: [
        { matcher: '*', hooks: [{ type: 'command', command: 'user-start', timeout: 5 }] },
      ],
      PostToolUse: [{ hooks: [{ type: 'command', command: 'user-post' }] }],
    },
  };
  const next = installHooks(existing, script, undefined, 'codex');
  expect(next.hooks?.SessionStart?.[0]).toEqual(existing.hooks.SessionStart[0]);
  expect(next.hooks?.PostToolUse?.[0]).toEqual(existing.hooks.PostToolUse[0]);
  expect(next.hooks?.SessionStart?.[1]?.hooks?.[0]?.command).toContain(
    ' codex # aether-office-hook:SessionStart',
  );
  expect(removeHooks(next)).toEqual(existing);
});

it('the installed command runs as-is with no PATH and no exec bit, and records only ids', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-run-'));
  const spool = join(dir, 'spool.jsonl');
  const receiver = join(process.cwd(), 'packages/providers/src/hook-receiver.mjs');
  for (const provider of ['claude', 'codex'] as const) {
    const command = installHooks({}, receiver, ['Stop'], provider).hooks!['Stop']![0]!.hooks![0]!
      .command!;
    const run = spawnSync('/bin/sh', ['-c', command], {
      env: { HOME: dir, PATH: '/usr/bin:/bin', AETHER_HOOK_SPOOL: spool },
      input: JSON.stringify({
        session_id: `s-${provider}`,
        cwd: dir,
        hook_event_name: 'Stop',
        prompt: 'SECRET',
      }),
    });
    expect(run.status).toBe(0);
  }
  const text = await readFile(spool, 'utf8');
  expect(text).toContain('"provider":"codex"');
  expect(text).toContain('"provider":"claude"');
  expect(text).not.toContain('SECRET');
});

it('asks Codex for permission requests and Claude additionally for notifications', () => {
  const names = (provider: 'claude' | 'codex') =>
    Object.keys(installHooks({}, script, undefined, provider).hooks ?? {});
  expect(names('codex')).toContain('PermissionRequest');
  expect(names('codex')).not.toContain('Notification');
  expect(names('claude')).toEqual(expect.arrayContaining(['PermissionRequest', 'Notification']));
});
