import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { NativeExecutor } from '../../apps/runner/src/native.js';

it('offers each configured provider CLI as a terminal in every granted repository, unchanged, only when asked', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'aether-cli-terminals-')));
  const repository = join(directory, 'my repo');
  execFileSync('git', ['init', '-q', repository]);
  const config = (cliTerminals?: boolean) => ({
    enabled: true,
    repositories: [repository],
    binaries: { claude: process.execPath, codex: process.execPath },
    ...(cliTerminals === undefined ? {} : { cliTerminals }),
  });
  expect(new NativeExecutor(join(directory, 'a'), config()).terminalProfiles.size).toBe(0);
  const executor = new NativeExecutor(join(directory, 'b'), config(true));
  expect([...executor.terminalProfiles.keys()].sort()).toEqual(['claude-my-repo', 'codex-my-repo']);
  for (const { profile, root } of executor.terminalProfiles.values()) {
    expect(profile.args).toEqual([]); // the CLI's normal permission mode: nothing is added to bypass it
    expect(profile.cwd).toBe(realpathSync(repository));
    expect(root).toBe(realpathSync(repository));
  }
});
