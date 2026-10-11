import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { NativeExecutor } from '../../apps/runner/src/native.js';
import type { Workspace } from '../../apps/runner/src/workspaces.js';
import type { ProviderEvent } from '../../packages/contracts/src/index.js';
it.each(['codex', 'claude'] as const)(
  'runs a synthetic %s reviewer in an independent fixed-commit Git checkout with read-only protocol',
  async (provider) => {
    const directory = mkdtempSync(join(tmpdir(), 'aether-native-review-'));
    const repository = join(directory, 'repo');
    const git = (args: string[], cwd = repository) =>
      execFileSync(
        'git',
        ['-C', cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
        { encoding: 'utf8' },
      ).trim();
    execFileSync('git', ['init', '-q', repository]);
    writeFileSync(join(repository, 'file.txt'), 'base');
    git(['add', '.']);
    git(['commit', '-qm', 'base']);
    const binary = join(directory, 'synthetic-' + provider);
    writeFileSync(
      binary,
      `#!${process.execPath}\nif(process.argv.includes('--version'))console.log(${JSON.stringify(provider === 'codex' ? 'codex-cli 0.159.2' : '2.1.286 (Claude Code)')});else await import(${JSON.stringify(pathToFileURL(resolve('tests/processes/' + provider + '-review.mjs')).href)});\n`,
      { mode: 0o700 },
    );
    try {
      const native = new NativeExecutor(join(directory, 'managed'), {
        enabled: true,
        repositories: [repository],
        binaries: { [provider]: binary },
      });
      const projectId = randomUUID(),
        workId = randomUUID();
      const writer = native.workspaces.create(projectId, workId, 1, repository);
      writeFileSync(join(writer.path, 'file.txt'), 'engineer change');
      git(['add', '.'], writer.path);
      git(['commit', '-qm', 'engineer'], writer.path);
      const headSha = git(['rev-parse', 'HEAD'], writer.path);
      writeFileSync(join(writer.path, 'uncommitted.txt'), 'preserve WIP');
      let reviewWorkspace: Workspace | undefined;
      const events: ProviderEvent[] = [];
      const result = await native.run(
        {
          id: randomUUID(),
          runId: randomUUID(),
          sessionId: randomUUID(),
          projectId,
          workId,
          agentId: randomUUID(),
          attempt: 1,
          epoch: 1,
          maxTurns: 1,
          timeoutMs: 5000,
          provider,
          mode: 'live',
          root: repository,
          purpose: 'review',
          reviewHead: headSha,
          reviewBase: writer.baseSha,
          prompt: `Review ${headSha}`,
        },
        {
          event: async (e) => {
            events.push(e);
          },
          permission: async () => {
            throw new Error('REVIEW_MUST_NOT_ESCALATE');
          },
          processStarted: async (identity) => {
            expect(identity).toBeTruthy();
          },
        },
        async (workspace) => {
          reviewWorkspace = workspace;
        },
        new AbortController().signal,
      );
      expect(result).toMatchObject({
        outcome: 'submitted',
        headSha,
        review: { decision: 'approve', headSha },
      });
      expect(reviewWorkspace?.path).not.toBe(writer.path);
      expect(reviewWorkspace?.baseSha).toBe(headSha);
      expect(readFileSync(join(reviewWorkspace!.path, 'file.txt'), 'utf8')).toBe('engineer change');
      expect(readFileSync(join(writer.path, 'uncommitted.txt'), 'utf8')).toBe('preserve WIP');
      expect(git(['rev-parse', 'HEAD'])).toBe(writer.baseSha);
      expect(events.some((e) => e.kind === 'turn.completed')).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  10000,
);
