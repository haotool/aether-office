import { linkSync, unlinkSync, writeFileSync } from 'node:fs';

/**
 * Written to a temporary file and hard-linked into place: fails with EEXIST when the name is taken and is
 * all-or-nothing when the process dies midway (a plain exclusive write leaves a partial file that blocks the name).
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
