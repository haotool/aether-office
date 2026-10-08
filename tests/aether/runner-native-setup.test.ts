import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { NativeExecutor } from '../../apps/runner/src/native.js';

function fixtureDir() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'aether-native-setup-')));
  const repository = join(directory, 'repo');
  execFileSync('git', ['init', '-q', repository]);
  return { directory, repository };
}

it('refuses observation and terminal roots that are not granted repositories', () => {
  const { directory, repository } = fixtureDir();
  const other = join(directory, 'other');
  execFileSync('git', ['init', '-q', other]);
  const base = {
    enabled: true as const,
    repositories: [repository],
    binaries: { claude: process.execPath },
  };
  expect(
    () =>
      new NativeExecutor(join(directory, 'w1'), {
        ...base,
        observations: {
          ext: {
            provider: 'claude',
            projectId: '00000000-0000-4000-8000-000000000001',
            agentId: '00000000-0000-4000-8000-000000000002',
            projectRoot: other,
            approvedRoot: repository,
            files: ['a.jsonl'],
          },
        },
      }),
  ).toThrow('OBSERVATION_PROJECT_NOT_GRANTED');
  expect(
    () =>
      new NativeExecutor(join(directory, 'w2'), {
        ...base,
        terminals: {
          shell: { binary: process.execPath, args: [], root: other, timeoutMs: 1000 },
        },
      }),
  ).toThrow('TERMINAL_ROOT_NOT_GRANTED');
});

it('registers verifiers and resolves observation roots to real paths', () => {
  const { directory, repository } = fixtureDir();
  const verifier = join(directory, 'verify.mjs');
  writeFileSync(verifier, 'process.exit(0);');
  const native = new NativeExecutor(join(directory, 'w'), {
    enabled: true,
    repositories: [repository],
    binaries: {},
    observations: {
      logs: {
        provider: 'codex',
        projectId: '00000000-0000-4000-8000-000000000003',
        agentId: '00000000-0000-4000-8000-000000000004',
        projectRoot: repository,
        approvedRoot: repository,
        files: ['session.jsonl'],
      },
    },
    verifiers: { smoke: { file: verifier, timeoutMs: 5000 } },
  });
  expect(native.verifiers.has('smoke')).toBe(true);
  expect(native.observationProfiles.get('logs')?.projectRoot).toBe(realpathSync(repository));
});

it('keeps an explicit terminal profile when cliTerminals would synthesize the same name', () => {
  const { directory, repository } = fixtureDir();
  const customArgs = ['--custom-flag'];
  const native = new NativeExecutor(join(directory, 'w'), {
    enabled: true,
    repositories: [repository],
    binaries: { claude: process.execPath },
    cliTerminals: true,
    terminals: {
      'claude-repo': {
        binary: process.execPath,
        args: customArgs,
        root: repository,
        timeoutMs: 120000,
      },
    },
  });
  expect(native.terminalProfiles.get('claude-repo')?.profile.args).toEqual(customArgs);
});
