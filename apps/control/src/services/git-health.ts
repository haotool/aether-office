import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { promisify } from 'node:util';
import { mapPool } from './pool.js';

/**
 * Read-only health of a repository's worktrees and branches: which are already merged into the default branch but
 * still around, which worktrees are gone from disk, and how much space each worktree takes. Nothing is removed here;
 * the report says what would be safe to remove and the commands that would do it.
 */
const run = promisify(execFile);
// Worktrees inspected at once: each is a few short git processes, mostly waiting on the disk.
const WIDTH = Math.min(12, availableParallelism());
const git = async (cwd: string, args: string[], timeout = 8000) =>
  (
    await run('git', ['-C', cwd, '-c', 'core.fsmonitor=false', ...args], {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: process.env['HOME'] ?? '',
        GIT_OPTIONAL_LOCKS: '0',
      },
    })
  ).stdout;

export type Worktree = {
  path: string;
  branch: string | null;
  head: string;
  main: boolean;
  locked: boolean;
  prunable: boolean;
};

/** Pure. `git worktree list --porcelain`. */
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
      main: out.length === 0, // the first entry is always the main worktree
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

async function defaultBranch(root: string): Promise<string> {
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

export async function gitHealth(root: string) {
  const base = await defaultBranch(root);
  const worktrees = parseWorktrees(await git(root, ['worktree', 'list', '--porcelain']));
  const baseHead = (await git(root, ['rev-parse', base])).trim();
  // On the default branch's tip a branch is either fast-forward merged or not worked on yet; git calls both merged.
  // Its reflog tells them apart: a branch that never moved after it was created has no work of its own.
  const movedSinceCreated = async (branch: string) =>
    list(
      await git(root, ['reflog', 'show', '--format=%H', `refs/heads/${branch}`]).catch(
        () => 'x\ny',
      ),
    ).length > 1;
  const merged = new Set(
    list(await git(root, ['branch', '--merged', base, '--format=%(refname:short)'])),
  );
  let remoteMerged: string[] = [];
  try {
    remoteMerged = list(
      await git(root, ['branch', '-r', '--merged', `origin/${base}`, '--format=%(refname:short)']),
    ).filter((b) => b !== `origin/${base}` && b !== 'origin/HEAD' && b !== 'origin');
  } catch {
    /* no remote */
  }
  // Each branch's last commit, for every worktree on a branch in one call instead of one `git log` each.
  const tips = new Map(
    list(
      await git(root, [
        'for-each-ref',
        '--format=%(refname:short)%09%(committerdate:unix)',
        'refs/heads',
      ]),
    ).flatMap((line) => {
      const [name, at] = line.split('\t');
      return name && Number(at) ? [[name, Number(at) * 1000] as const] : [];
    }),
  );
  const inspect = async (w: Worktree) => {
    if (w.prunable) return { ...w, merged: false, dirty: null, lastCommitAt: null };
    const isMerged =
      !w.main &&
      !!w.branch &&
      w.branch !== base &&
      merged.has(w.branch) &&
      (w.head !== baseHead || (await movedSinceCreated(w.branch)));
    // Whether a worktree has uncommitted changes is only asked of the ones that could be removed: it is what decides
    // that, and `git status` over hundreds of worktrees is most of the cost of the report.
    const [status, last] = await Promise.all([
      isMerged
        ? git(w.path, ['status', '--porcelain=v1', '--untracked-files=normal']).catch(() => null)
        : Promise.resolve(null),
      w.branch && tips.has(w.branch)
        ? Promise.resolve('')
        : git(w.path, ['log', '-1', '--format=%ct']).catch(() => ''), // a detached checkout has no branch tip
    ]);
    return {
      ...w,
      merged: isMerged,
      dirty: status === null ? null : list(status).length,
      lastCommitAt: (w.branch && tips.get(w.branch)) || Number(last.trim()) * 1000 || null,
    };
  };
  const rows = await mapPool(worktrees, WIDTH, inspect);
  const removable = rows.filter((w) => w.merged && w.dirty === 0 && !w.locked);
  const inWorktree = new Set(rows.flatMap((w) => (w.branch ? [w.branch] : [])));
  const staleBranches = [...merged].filter((b) => b !== base && !inWorktree.has(b));
  return {
    defaultBranch: base,
    worktrees: rows,
    staleBranches,
    remoteMerged,
    removable: removable.map((w) => w.path),
    // What a person could run after reading the list: nothing here is executed.
    suggestions: [
      ...(rows.some((w) => w.prunable) ? ['git worktree prune'] : []),
      ...removable.map((w) => `git worktree remove ${JSON.stringify(w.path)}`),
      ...staleBranches.map((b) => `git branch -d ${b}`),
      ...remoteMerged.map((b) => `git push origin --delete ${b.replace(/^origin\//, '')}`),
    ],
  };
}

/**
 * How much disk each worktree takes (`du`), apart from the report because it is by far the slow part: the report is
 * useful at once, the sizes follow. A size that could not be read is null, never zero.
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

export type CleanResult = { path: string; outcome: 'removed' | 'skipped'; reason?: string };

/**
 * Removes worktrees that are merged into the default branch and have nothing uncommitted. Safety, in order:
 * every requested path is re-checked against a fresh report (merged, clean, not the main worktree, not locked);
 * a worktree a live agent process is working in is skipped; removal is `git worktree remove` without `--force`,
 * so Git itself refuses one with modified or untracked files; no branch is deleted; finally `git worktree prune`
 * drops the records of worktrees whose directories are already gone.
 */
export async function cleanMergedWorktrees(
  root: string,
  paths: readonly string[],
  busyDirectories: readonly string[],
): Promise<CleanResult[]> {
  const report = await gitHealth(root);
  const byPath = new Map(report.worktrees.map((w) => [w.path, w]));
  const inside = (dir: string, path: string) => dir === path || dir.startsWith(`${path}/`);
  const results: CleanResult[] = [];
  for (const path of [...new Set(paths)]) {
    const w = byPath.get(path);
    const reason = !w
      ? 'not a worktree of this repository'
      : w.main
        ? 'the main worktree'
        : w.locked
          ? 'locked'
          : !w.merged
            ? 'not merged into the default branch'
            : w.dirty !== 0
              ? 'has uncommitted changes'
              : busyDirectories.some((dir) => inside(dir, path))
                ? 'an agent is working in it'
                : null;
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
        reason: message.trim().split('\n')[0]!.slice(0, 200),
      });
    }
  }
  if (report.worktrees.some((w) => w.prunable))
    await git(root, ['worktree', 'prune']).catch(() => '');
  return results;
}
