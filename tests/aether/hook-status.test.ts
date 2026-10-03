import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { installHooks } from '../../packages/providers/src/claude-hooks.js';
import {
  codexHookTrust,
  fileHookStatus,
  registeredEvents,
  stateOf,
} from '../../packages/providers/src/hook-status.js';

const script = '/opt/aether/hook.mjs';

it('reads installed, partial and absent states, and treats malformed nodes as absent instead of throwing', async () => {
  const full = installHooks({}, script, undefined, 'codex');
  const dir = await mkdtemp(join(tmpdir(), 'aether-status-'));
  const file = join(dir, 'hooks.json');
  await writeFile(file, JSON.stringify(full));
  expect(await fileHookStatus(file, 'codex')).toEqual({ state: 'installed', missing: [] });
  const { Stop: _drop, ...partial } = full.hooks!;
  await writeFile(file, JSON.stringify({ hooks: partial }));
  expect(await fileHookStatus(file, 'codex')).toMatchObject({
    state: 'partial',
    missing: ['Stop'],
  });
  expect(await fileHookStatus(join(dir, 'none.json'), 'codex')).toMatchObject({
    state: 'not_installed',
  });
  for (const junk of [
    null,
    7,
    [],
    { hooks: 3 },
    { hooks: { Stop: [null, 1, { hooks: 'x' }, { hooks: [null] }] } },
  ])
    expect(registeredEvents(junk, ['Stop']).size).toBe(0);
  expect(stateOf(0, 3)).toBe('not_installed');
});

it('asks Codex which of our hooks it trusts, and ignores everyone else’s hooks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-fake-codex-'));
  const bin = join(dir, 'codex');
  await writeFile(
    bin,
    `#!${process.execPath}
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (v) => process.stdout.write(JSON.stringify(v) + '\\n');
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: {} });
  if (m.method === 'hooks/list')
    send({ id: m.id, result: { data: [{ hooks: [
      { eventName: 'stop', command: '"/x/node" "/y/hook.mjs" codex # aether-office-hook:Stop', trustStatus: 'untrusted', enabled: true },
      { eventName: 'preToolUse', command: '"/x/node" "/y/hook.mjs" codex # aether-office-hook:PreToolUse', trustStatus: 'trusted', enabled: false },
      { eventName: 'stop', command: 'someone-elses-hook', trustStatus: 'trusted', enabled: true },
    ] }] } });
});
`,
  );
  await chmod(bin, 0o755);
  expect(await codexHookTrust(bin, dir)).toEqual([
    { event: 'stop', trusted: false, enabled: true },
    { event: 'preToolUse', trusted: true, enabled: false },
  ]);
});
