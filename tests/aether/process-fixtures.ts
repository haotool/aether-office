import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { delimiter } from 'node:path';
import { inspectProcess, processIdentity } from '../../packages/providers/src/index.js';

/** macOS keeps `lsof` in `/usr/sbin`; stripped PATHs (e.g. `env -i`) omit it and process scans never resolve cwd. */
export function ensureProcessToolPath(): void {
  if (process.platform === 'win32') return;
  const extras = process.platform === 'darwin' ? ['/usr/sbin', '/sbin'] : [];
  const parts = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean);
  const have = new Set(parts);
  const add = extras.filter((p) => !have.has(p));
  if (add.length) process.env['PATH'] = [...add, ...parts].join(delimiter);
}
ensureProcessToolPath();

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const until = async (check: () => boolean, ms = 4000) => {
  for (let waited = 0; waited < ms && !check(); waited += 50) await sleep(50);
  return check();
};
export const untilAsync = async (check: () => Promise<boolean>, ms = 4000) => {
  for (let waited = 0; waited < ms && !(await check()); waited += 50) await sleep(50);
  return check();
};
export async function startReady(
  script: string,
  options: SpawnOptions = {},
): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['-e', `${script};process.stdout.write('ready')`], {
    ...options,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  await new Promise((ready) => child.stdout!.once('data', ready));
  child.stdout!.destroy();
  return child;
}
export const alive = (pid: number) => inspectProcess(pid) !== null;

export async function orphan(): Promise<{ pid: number; identity: string }> {
  const middle = spawn(
    process.execPath,
    [
      '-e',
      `const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});console.log(c.pid);c.unref()`,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  let out = '';
  middle.stdout.on('data', (d) => (out += d));
  await new Promise((r) => middle.once('close', r));
  const pid = Number(out.trim());
  await until(() => inspectProcess(pid)?.ppid === 1);
  return { pid, identity: processIdentity({ pid }) };
}
