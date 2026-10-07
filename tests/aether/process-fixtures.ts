import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { inspectProcess, processIdentity } from '../../packages/providers/src/index.js';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const until = async (check: () => boolean, ms = 4000) => {
  for (let waited = 0; waited < ms && !check(); waited += 50) await sleep(50);
  return check();
};
/** Starts `node -e script` and resolves once the script has run to its last statement (handlers installed, children spawned). */
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

/** An orphan: its parent has already exited, so init has it; its own group, as everything the runner starts is. */
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
