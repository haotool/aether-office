import { execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';

/** How long a provider CLI gets to answer `--version`. A slow start on a busy machine (over three seconds at a load
 * average of 18) is not a missing binary. */
export const VERSION_PROBE_MS = 10_000;
export function processIdentity(child: Pick<ChildProcessWithoutNullStreams, 'pid'>): string {
  if (!child.pid) throw new Error('PROCESS_NOT_SPAWNED');
  const birth = execFileSync('ps', ['-p', String(child.pid), '-o', 'lstart='], {
    encoding: 'utf8',
    timeout: 2000,
  }).trim();
  if (!birth) throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
  return `${child.pid}:${birth}`;
}
