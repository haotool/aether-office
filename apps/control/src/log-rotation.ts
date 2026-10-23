import { copyFileSync, statSync, truncateSync } from 'node:fs';

/** launchd keeps appending to one open file and never rotates it: past `maxBytes`, copy the log to `<file>.1` and empty it in place. */
export function rotateLog(file: string, maxBytes = 10 * 1024 * 1024): boolean {
  try {
    if (statSync(file).size <= maxBytes) return false;
    copyFileSync(file, `${file}.1`);
    truncateSync(file, 0);
    return true;
  } catch {
    return false;
  }
}
