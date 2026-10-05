import { linkSync, unlinkSync, writeFileSync } from 'node:fs';

/**
 * Creates a file that must not exist yet, and never leaves half of it behind: the content is written to a temporary
 * file beside it and hard-linked into place, which fails with EEXIST when the name is taken (as `flag: 'wx'` does) and
 * is all-or-nothing when the process dies in the middle (a plain exclusive write leaves a partial file that blocks the
 * name and cannot be read). The idea is gastown's atomicfile; the exclusive create is the difference.
 */
export function createFileOnce(path: string, data: string, mode: number): void {
  const temporary = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(temporary, data, { mode, flag: 'wx' });
  try {
    linkSync(temporary, path);
  } finally {
    unlinkSync(temporary);
  }
}
