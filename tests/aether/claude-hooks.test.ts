import { expect, it } from 'vitest';
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
  await installHooksFile(join(dir, 'new', 'settings.json'), script); // missing file is created
});
