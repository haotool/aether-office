import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { NativeExecutor } from '../../apps/runner/src/native.js';
import type { ProviderEvent, RunCommand } from '../../packages/contracts/src/index.js';

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'aether-acp-native-'));
  const repository = join(directory, 'repo');
  execFileSync('git', ['init', '-q', repository]);
  writeFileSync(join(repository, 'file.txt'), 'base');
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-C', repository, '-c', 'user.name=F', '-c', 'user.email=f@example.invalid', ...args],
      { encoding: 'utf8' },
    ).trim();
  git('add', '.');
  git('commit', '-qm', 'base');
  const native = new NativeExecutor(join(directory, 'managed'), {
    enabled: true,
    repositories: [repository],
    binaries: {},
    acpAgent: {
      command: process.execPath,
      args: [resolve('packages/providers/src/acp-fixture.mjs')],
    },
  });
  const command = (extra: Partial<RunCommand> = {}): RunCommand => ({
    id: randomUUID(),
    runId: randomUUID(),
    sessionId: randomUUID(),
    projectId: randomUUID(),
    workId: randomUUID(),
    agentId: randomUUID(),
    attempt: 1,
    epoch: 1,
    maxTurns: 1,
    timeoutMs: 15000,
    provider: 'acp',
    mode: 'live',
    root: repository,
    prompt: 'Please run the tests',
    ...extra,
  });
  return { directory, native, command, git };
}

it('runs a generic ACP agent in an isolated workspace, with approval decided by the platform', async () => {
  const t = setup();
  try {
    expect(t.native.providers).toEqual(['acp']);
    const events: ProviderEvent[] = [];
    const asked: string[] = [];
    const result = await t.native.run(
      t.command(),
      {
        event: async (e) => void events.push(e),
        permission: async (p) => {
          asked.push(p.kind);
          return 'approve';
        },
        processStarted: async () => {},
      },
      async () => {},
      new AbortController().signal,
    );
    expect(result).toMatchObject({ outcome: 'submitted', summary: 'Hello world' });
    expect(result.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(asked).toEqual(['execute']);
    expect(events.map((e) => e.kind)).toContain('tool.completed');
  } finally {
    rmSync(t.directory, { recursive: true, force: true });
  }
});

it('refuses read-only review and session resume, which a generic ACP agent cannot guarantee', async () => {
  const t = setup();
  try {
    const sink = {
      event: async () => {},
      permission: async () => 'deny' as const,
      processStarted: async () => {},
    };
    const head = t.git('rev-parse', 'HEAD');
    await expect(
      t.native.run(
        t.command({ purpose: 'review', reviewHead: head, reviewBase: head }),
        sink,
        async () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('CAPABILITY_UNSUPPORTED');
    await expect(
      t.native.run(
        t.command({ resumeSessionId: 'earlier' }),
        sink,
        async () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('CAPABILITY_UNSUPPORTED');
  } finally {
    rmSync(t.directory, { recursive: true, force: true });
  }
});
