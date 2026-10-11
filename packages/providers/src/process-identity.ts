import { execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';

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
