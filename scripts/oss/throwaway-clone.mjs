import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CLONE_MARKER, git, toplevel } from './git-messages.mjs';

function gitDirOf(dir) {
  return existsSync(path.join(dir, 'HEAD')) && existsSync(path.join(dir, 'objects'))
    ? dir
    : path.join(dir, '.git');
}

/**
 * Refuses unless `dir` is a throwaway clone created by history-apply: marker present, not the current checkout or the
 * recorded source, not inside the checkout, and no remote `origin` that still points anywhere.
 */
export function assertThrowawayClone(dir, { cwd = process.cwd() } = {}) {
  if (!existsSync(dir)) throw new Error(`refusing: ${dir} does not exist`);
  const real = realpathSync(dir);
  const marker = path.join(gitDirOf(real), CLONE_MARKER);
  if (!existsSync(marker))
    throw new Error(
      `refusing: ${dir} is not a throwaway clone created by history-apply (no ${CLONE_MARKER})`,
    );
  const info = JSON.parse(readFileSync(marker, 'utf8'));
  const top = toplevel(cwd);
  const inside = (parent) => parent && (real === parent || real.startsWith(parent + path.sep));
  if (inside(top))
    throw new Error(`refusing: ${dir} is, or is inside, the current checkout ${top}`);
  if (info.source && existsSync(info.source) && realpathSync(info.source) === real)
    throw new Error(`refusing: ${dir} is the source repository`);
  const remotes = git(real, ['remote']).split('\n').filter(Boolean);
  if (remotes.includes('origin') && git(real, ['config', '--get', 'remote.origin.url']).trim())
    throw new Error(
      `refusing: ${dir} still has a remote origin; a throwaway clone must not point anywhere`,
    );
  return info;
}

/** Refuses an output directory that could be a real checkout: it must not exist (or be empty) and sit outside it. */
export function assertFreshOutput(out, source) {
  const resolved = path.resolve(out);
  if (existsSync(resolved)) {
    const entries = execFileSync('ls', ['-A', resolved], { encoding: 'utf8' }).trim();
    if (entries) throw new Error(`refusing: output ${out} exists and is not empty`);
  }
  const top = toplevel(source);
  const roots = [
    top,
    top && realpathSync(path.resolve(top, git(top, ['rev-parse', '--git-common-dir']).trim())),
  ];
  const parent = existsSync(resolved)
    ? realpathSync(resolved)
    : path.join(realpathSync(path.dirname(resolved)), path.basename(resolved));
  for (const root of roots)
    if (root && (parent === root || parent.startsWith(root + path.sep)))
      throw new Error(`refusing: output ${out} is inside the source repository ${root}`);
}
