import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { groupAlive, groupStopper } from '@aether/providers';
import type { Harness } from './workspaces.js';

const OUTPUT_LIMIT_BYTES = 1024 * 1024;

/** Its whole process group is stopped when it ends, aborts, times out or passes the output limit. */
export async function runHarnessProcess(
  harness: Harness,
  cwd: string,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
) {
  let output = '';
  let outputBytes = 0;
  let capped = false;
  let timedOut = false;
  const child = spawn(harness.executable, harness.args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const stopper = groupStopper(child);
  const { stop } = stopper;
  const collect = (chunk: string) => {
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > OUTPUT_LIMIT_BYTES) {
      capped = true;
      stop();
      return;
    }
    output += chunk;
  };
  for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', collect);
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, harness.timeoutMs).unref();
  if (signal?.aborted) stop();
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('close', resolve);
    child.once('error', reject);
  }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  });
  stop();
  for (let i = 0; i < 100 && child.pid && groupAlive(child.pid); i++) await sleep(20);
  stopper.cancel();
  return { output, exitCode, capped, timedOut };
}
