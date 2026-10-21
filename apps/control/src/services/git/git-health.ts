import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { promisify } from 'node:util';
import { shQuote } from '@aether/kernel';
import { mapPool } from '../runtime/pool.js';

/**
 * Read-only: nothing is removed here; the report says what would be safe to remove and the commands that would do it.
 */
const run = promisify(execFile);
const WIDTH = Math.min(12, availableParallelism());
/** The one way AETHER runs git: read-only, no fsmonitor hook (a repository's own config must not run code), no optional locks. */
export const git = async (
  cwd: string,
  args: string[],
  timeout = 8000,
  maxBuffer = 8 * 1024 * 1024,
) =>
  (
    await run('git', ['-C', cwd, '-c', 'core.fsmonitor=false', ...args], {
      timeout,
      maxBuffer,
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: process.env['HOME'] ?? '',
        GIT_OPTIONAL_LOCKS: '0',
      },
    })
  ).stdout;

type Worktree = {
  path: string;
  branch: string | null;
  head: string;
  main: boolean;
  locked: boolean;
  prunable: boolean;
};

export function parseWorktrees(text: string): Worktree[] {
  const out: Worktree[] = [];
  for (const block of text.split('\n\n')) {
    const lines = block.split('\n').filter(Boolean);
    const path = lines.find((l) => l.startsWith('worktree '))?.slice(9);
    if (!path) continue;
    const ref = lines.find((l) => l.startsWith('branch '))?.slice(7) ?? null;
    out.push({
      path,
      branch: ref?.replace(/^refs\/heads\//, '') ?? null,
      head: lines.find((l) => l.startsWith('HEAD '))?.slice(5) ?? '',
      main: out.length === 0,
      locked: lines.some((l) => l === 'locked' || l.startsWith('locked ')),
      prunable: lines.some((l) => l === 'prunable' || l.startsWith('prunable ')),
    });
  }
  return out;
}

const sizes = new Map<string, { at: number; bytes: number | null }>();
const SIZE_TTL_MS = 10 * 60 * 1000;
/** Disk taken by a directory (`du -sk`, bounded); cached because a worktree with dependencies installed is large. */
async function sizeOf(path: string): Promise<number | null> {
  const hit = sizes.get(path);
  if (hit && Date.now() - hit.at < SIZE_TTL_MS) return hit.bytes;
  let bytes: number | null = null;
  try {
    const { stdout } = await run('du', ['-sk', path], { timeout: 30000, maxBuffer: 1024 * 1024 });
    bytes = Number(stdout.split(/\s/)[0]) * 1024;
  } catch {
    bytes = null; // too slow or unreadable: unknown, never zero
  }
  sizes.set(path, { at: Date.now(), bytes });
  return bytes;
}

export async function defaultBranch(root: string): Promise<string> {
  try {
    return (await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))
      .trim()
      .replace(/^origin\//, '');
  } catch {
    for (const name of ['main', 'master'])
      try {
        await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]);
        return name;
      } catch {
        /* try the next */
      }
    return (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  }
}

const list = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** On the default branch's tip a branch is either fast-forward merged or not worked on yet; git calls both merged.
 * Its reflog tells them apart: a branch that never moved after it was created has no work of its own. */
const movedSinceCreated = async (root: string, branch: string) =>
  list(
    await git(root, ['reflog', 'show', '--format=%H', `refs/heads/${branch}`]).catch(() => 'x\ny'),
  ).length > 1;

async function remoteMergedBranches(root: string, base: string): Promise<string[]> {
  try {
    return list(
      await git(root, ['branch', '-r', '--merged', `origin/${base}`, '--format=%(refname:short)']),
    ).filter((b) => b !== `origin/${base}` && b !== 'origin/HEAD' && b !== 'origin');
  } catch {
    return [];
  }
}

/** Each branch's last commit, for every worktree on a branch in one call instead of one `git log` each. */
async function branchTips(root: string) {
  const text = await git(root, [
    'for-each-ref',
    '--format=%(refname:short)%09%(committerdate:unix)',
    'refs/heads',
  ]);
  return new Map(
    list(text).flatMap((line) => {
      const [name, at] = line.split('\t');
      return name && Number(at) ? [[name, Number(at) * 1000] as const] : [];
    }),
  );
}

type Survey = {
  root: string;
  base: string;
  baseHead: string;
  merged: Set<string>;
  tips: Map<string, number>;
};

async function inspectWorktree(survey: Survey, w: Worktree) {
  const { root, base, baseHead, merged, tips } = survey;
  if (w.prunable) return { ...w, merged: false, dirty: null, lastCommitAt: null };
  const isMerged =
    !w.main &&
    !!w.branch &&
    w.branch !== base &&
    merged.has(w.branch) &&
    (w.head !== baseHead || (await movedSinceCreated(root, w.branch)));
  const [status, last] = await Promise.all([
    isMerged
      ? git(w.path, ['status', '--porcelain=v1', '--untracked-files=normal']).catch(() => null)
      : Promise.resolve(null),
    w.branch && tips.has(w.branch)
      ? Promise.resolve('')
      : git(w.path, ['log', '-1', '--format=%ct']).catch(() => ''),
  ]);
  return {
    ...w,
    merged: isMerged,
    dirty: status === null ? null : list(status).length,
    lastCommitAt: (w.branch && tips.get(w.branch)) || Number(last.trim()) * 1000 || null,
  };
}

export async function gitHealth(root: string) {
  const base = await defaultBranch(root);
  const worktrees = parseWorktrees(await git(root, ['worktree', 'list', '--porcelain']));
  const baseHead = (await git(root, ['rev-parse', base])).trim();
  const merged = new Set(
    list(await git(root, ['branch', '--merged', base, '--format=%(refname:short)'])),
  );
  const remoteMerged = await remoteMergedBranches(root, base);
  const tips = await branchTips(root);
  const survey = { root, base, baseHead, merged, tips };
  const rows = await mapPool(worktrees, WIDTH, (w) => inspectWorktree(survey, w));
  const removable = rows.filter((w) => w.merged && w.dirty === 0 && !w.locked);
  const inWorktree = new Set(rows.flatMap((w) => (w.branch ? [w.branch] : [])));
  const staleBranches = [...merged].filter((b) => b !== base && !inWorktree.has(b));
  return {
    defaultBranch: base,
    worktrees: rows,
    staleBranches,
    remoteMerged,
    removable: removable.map((w) => w.path),
    suggestions: [
      ...(rows.some((w) => w.prunable) ? ['git worktree prune'] : []),
      ...removable.map((w) => `git worktree remove ${shQuote(w.path)}`),
      ...staleBranches.map((b) => `git branch -d ${shQuote(b)}`),
      ...remoteMerged.map((b) => `git push origin --delete ${shQuote(b.replace(/^origin\//, ''))}`),
    ],
  };
}

/**
 * Disk used by each worktree (`du`), kept apart from the report because it is the slow part. An unreadable size is
 * null, never zero.
 */
export async function worktreeSizes(
  root: string,
): Promise<{ sizes: Record<string, number | null> }> {
  const worktrees = parseWorktrees(await git(root, ['worktree', 'list', '--porcelain'])).filter(
    (w) => !w.prunable,
  );
  const sized = await mapPool(
    worktrees,
    WIDTH,
    async (w) => [w.path, await sizeOf(w.path)] as const,
  );
  return { sizes: Object.fromEntries(sized) };
}

type CleanResult = { path: string; outcome: 'removed' | 'skipped'; reason?: string };

type Row = Awaited<ReturnType<typeof inspectWorktree>>;

const insideWorktree = (dir: string, path: string) => dir === path || dir.startsWith(`${path}/`);

function skipCleanWorktreeReason(
  w: Row | undefined,
  path: string,
  busyDirectories: readonly string[],
): string | null {
  if (!w) return 'not a worktree of this repository';
  if (w.main) return 'the main worktree';
  if (w.locked) return 'locked';
  if (!w.merged) return 'not merged into the default branch';
  if (w.dirty !== 0) return 'has uncommitted changes';
  if (busyDirectories.some((dir) => insideWorktree(dir, path))) return 'an agent is working in it';
  return null;
}

/**
 * Removes worktrees that are merged and clean, re-checking each path against a fresh report and skipping one a live
 * agent works in. Uses `git worktree remove` without `--force`, so Git itself refuses modified or untracked files; no
 * branch is deleted.
 */
export async function cleanMergedWorktrees(
  root: string,
  paths: readonly string[],
  busyDirectories: readonly string[],
): Promise<CleanResult[]> {
  const report = await gitHealth(root);
  const byPath = new Map(report.worktrees.map((w) => [w.path, w]));
  const results: CleanResult[] = [];
  for (const path of [...new Set(paths)]) {
    const reason = skipCleanWorktreeReason(byPath.get(path), path, busyDirectories);
    if (reason) {
      results.push({ path, outcome: 'skipped', reason });
      continue;
    }
    try {
      await git(root, ['worktree', 'remove', path], 60000); // no --force: Git refuses anything not clean
      sizes.delete(path);
      results.push({ path, outcome: 'removed' });
    } catch (error) {
      const message = String((error as { stderr?: string }).stderr ?? (error as Error).message);
      results.push({
        path,
        outcome: 'skipped',
        reason: (message.trim().split('\n')[0] ?? '').slice(0, 200),
      });
    }
  }
  if (report.worktrees.some((w) => w.prunable))
    await git(root, ['worktree', 'prune']).catch(() => '');
  return results;
}
