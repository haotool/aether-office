import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Journal } from '../../apps/runner/src/journal.js';
import { NativeExecutor } from '../../apps/runner/src/native.js';
import { ObserverRunner } from '../../apps/runner/src/observers.js';

it('discovery refresh merges explicit files, discovered files, and journal-known files', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aether-observer-refresh-')));
  const logs = join(root, 'logs');
  mkdirSync(logs);
  writeFileSync(join(logs, 'session.jsonl'), '{}\n');
  writeFileSync(join(logs, 'extra.jsonl'), '{}\n');
  const projectId = randomUUID();
  const agentId = randomUUID();
  const native = new NativeExecutor(join(root, 'workspaces'), {
    enabled: true,
    repositories: [root],
    binaries: {},
    observations: {
      external: {
        provider: 'codex',
        projectId,
        agentId,
        projectRoot: root,
        approvedRoot: logs,
        files: ['session.jsonl'],
        discover: true,
      },
    },
  });
  const journal = new Journal(join(root, 'journal.json'));
  const runner = new ObserverRunner(
    journal,
    native,
    async () => ({}),
    () => 0,
  );
  await runner.tick();
  expect(Object.keys(journal.state.observers).length).toBeGreaterThan(0);
});

it('returns a discovery error instead of throwing when observation roots drift', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aether-observer-drift-')));
  const logs = join(root, 'logs');
  mkdirSync(logs);
  writeFileSync(join(logs, 'session.jsonl'), '{}\n');
  const native = new NativeExecutor(join(root, 'workspaces'), {
    enabled: true,
    repositories: [root],
    binaries: {},
    observations: {
      external: {
        provider: 'codex',
        projectId: randomUUID(),
        agentId: randomUUID(),
        projectRoot: root,
        approvedRoot: logs,
        files: ['session.jsonl'],
      },
    },
  });
  const profile = native.observationProfiles.get('external')!;
  const alias = join(root, 'logs-alias');
  symlinkSync(profile.approvedRoot, alias);
  native.observationProfiles.set('external', { ...profile, approvedRoot: alias });
  const journal = new Journal(join(root, 'journal.json'));
  const runner = new ObserverRunner(
    journal,
    native,
    async () => ({}),
    () => 10_000,
  );
  await expect(runner.tick()).rejects.toThrow('OBSERVATION_PATH_CHANGED');
});

it('enforces the observation file limit during refresh', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aether-observer-limit-')));
  const logs = join(root, 'logs');
  mkdirSync(logs);
  for (let i = 0; i < 65; i++) writeFileSync(join(logs, `f-${i}.jsonl`), '{}\n');
  const native = new NativeExecutor(join(root, 'workspaces'), {
    enabled: true,
    repositories: [root],
    binaries: {},
    observations: {
      external: {
        provider: 'codex',
        projectId: randomUUID(),
        agentId: randomUUID(),
        projectRoot: root,
        approvedRoot: logs,
        files: [],
        discover: true,
      },
    },
  });
  const journal = new Journal(join(root, 'journal.json'));
  const runner = new ObserverRunner(
    journal,
    native,
    async () => ({}),
    () => 10_000,
  );
  return expect(runner.tick()).rejects.toThrow('OBSERVATION_FILE_LIMIT');
});
