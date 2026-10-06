import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ensurePrivateDir, writePrivateFile } from './approval-config.mjs';

// The synchronous approval hook decides what Claude Code may run, so it must not live where an agent can edit it: a
// worktree is writable by the very agent the hook gates. The installer copies it (and the one helper it imports) into a
// private directory of the user's own home and points settings at that copy.
const FILES = ['hook-approval.mjs', 'approval-config.mjs'] as const;
const SOURCE = import.meta.dirname;
export const approvalScriptsDir = () => join(homedir(), '.aether', 'hooks');
export type ApprovalScriptsState = 'installed' | 'modified' | 'missing';

const sha = (content: Buffer) => createHash('sha256').update(content).digest('hex');

/** Does the installed copy match the repository's source, byte for byte (compared by SHA-256)? */
export async function approvalScriptsStatus(
  dir = approvalScriptsDir(),
): Promise<ApprovalScriptsState> {
  const found = await Promise.all(
    FILES.map(async (name) => {
      const copy = await readFile(join(dir, name)).catch(() => null);
      if (copy === null) return 'missing';
      return sha(copy) === sha(await readFile(join(SOURCE, name))) ? 'installed' : 'modified';
    }),
  );
  if (found.every((state) => state === 'missing')) return 'missing';
  return found.every((state) => state === 'installed') ? 'installed' : 'modified';
}

/** Copies the hook and its helper into `dir` (0700; files 0500, written atomically) and returns the hook's path. */
export async function installApprovalScripts(dir = approvalScriptsDir()): Promise<string> {
  ensurePrivateDir(dir);
  for (const name of FILES)
    writePrivateFile(join(dir, name), await readFile(join(SOURCE, name), 'utf8'), 0o500);
  return join(dir, FILES[0]);
}
