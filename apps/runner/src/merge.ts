import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { environment } from './workspaces.js';

/**
 * Serial integration of a reviewed commit into a LOCAL candidate branch.
 * It never moves the base branch, never pushes, never resolves conflicts, and never touches the
 * user's checkout: all work happens in a throwaway worktree that is always removed.
 */
type MergeResult =
  | { status: 'merged'; baseSha: string; headSha: string; mergeSha: string; candidate: string }
  | { status: 'up_to_date'; baseSha: string; headSha: string }
  | { status: 'conflict'; baseSha: string; headSha: string; files: string[] }
  | { status: 'base_moved'; expected: string; actual: string };

export type MergeRequest = {
  repository: string;
  baseBranch: string;
  expectedBase: string;
  headSha: string;
  candidate: string;
  scratchDir: string;
  hooksDir: string;
  author: { name: string; email: string };
};

const SHA = /^[0-9a-f]{40}$/;
const queues = new Map<string, Promise<unknown>>();

function git(cwd: string, hooks: string, args: string[], allowFailure = false): string {
  try {
    return execFileSync(
      'git',
      [
        '--no-optional-locks',
        '-c',
        `core.hooksPath=${hooks}`,
        '-c',
        'core.fsmonitor=false',
        '-C',
        cwd,
        ...args,
      ],
      {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
        env: environment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trimEnd();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function validate(r: MergeRequest) {
  if (!SHA.test(r.expectedBase) || !SHA.test(r.headSha)) throw new Error('MERGE_SHA_INVALID');
  for (const name of [r.baseBranch, r.candidate]) {
    if (name.startsWith('-') || !/^[\w./-]{1,100}$/.test(name))
      throw new Error('MERGE_REF_INVALID');
    git(r.repository, r.hooksDir, ['check-ref-format', '--branch', name]);
  }
  if (!r.candidate.startsWith('aether/')) throw new Error('MERGE_CANDIDATE_NAMESPACE');
}

function integrateNow(r: MergeRequest): MergeResult {
  validate(r);
  const actual = git(r.repository, r.hooksDir, [
    'rev-parse',
    '--verify',
    `refs/heads/${r.baseBranch}`,
  ]);
  if (actual !== r.expectedBase) return { status: 'base_moved', expected: r.expectedBase, actual };
  git(r.repository, r.hooksDir, ['cat-file', '-e', `${r.headSha}^{commit}`]);
  // Nothing to integrate when the commit is already reachable from base.
  try {
    git(r.repository, r.hooksDir, ['merge-base', '--is-ancestor', r.headSha, r.expectedBase]);
    return { status: 'up_to_date', baseSha: r.expectedBase, headSha: r.headSha };
  } catch {
    // not an ancestor: continue
  }
  const dir = mkdtempSync(join(r.scratchDir, 'integrate-'));
  const tree = join(dir, 'tree');
  try {
    git(r.repository, r.hooksDir, ['worktree', 'add', '--detach', tree, r.expectedBase]);
    const merge = (args: string[]) =>
      git(tree, r.hooksDir, [
        '-c',
        `user.name=${r.author.name}`,
        '-c',
        `user.email=${r.author.email}`,
        ...args,
      ]);
    try {
      merge(['merge', '--no-ff', '--no-commit', r.headSha]);
    } catch {
      const files = git(tree, r.hooksDir, ['diff', '--name-only', '--diff-filter=U'], true)
        .split('\n')
        .filter(Boolean);
      git(tree, r.hooksDir, ['merge', '--abort'], true);
      return { status: 'conflict', baseSha: r.expectedBase, headSha: r.headSha, files };
    }
    merge([
      'commit',
      '--no-verify',
      '-m',
      `Integrate ${r.headSha.slice(0, 12)} into ${r.baseBranch}`,
    ]);
    const mergeSha = git(tree, r.hooksDir, ['rev-parse', 'HEAD']);
    // `branch` without -f refuses to overwrite an existing candidate.
    try {
      git(r.repository, r.hooksDir, ['branch', r.candidate, mergeSha]);
    } catch (cause) {
      throw new Error('MERGE_CANDIDATE_EXISTS', { cause });
    }
    return {
      status: 'merged',
      baseSha: r.expectedBase,
      headSha: r.headSha,
      mergeSha,
      candidate: r.candidate,
    };
  } finally {
    git(r.repository, r.hooksDir, ['worktree', 'remove', '--force', tree], true);
    rmSync(dir, { recursive: true, force: true });
    git(r.repository, r.hooksDir, ['worktree', 'prune'], true);
  }
}

/** Integrations for one repository run strictly one at a time. */
export function integrate(r: MergeRequest): Promise<MergeResult> {
  const previous = queues.get(r.repository) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => integrateNow(r));
  queues.set(r.repository, next);
  return next;
}
