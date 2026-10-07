import { StringDecoder } from 'node:string_decoder';
import { spawn } from 'node:child_process';
import { groupStopper } from '@aether/providers';
import type { Harness } from './workspaces.js';

const OUTPUT_LIMIT_BYTES = 1024 * 1024;

/**
 * Runs a verification harness in `cwd` with the given environment, collecting its output up to a limit. It ends when it
 * exits, when `signal` aborts, after its timeout or when the output limit is passed; its whole process group is stopped.
 */
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
  const decoder = new StringDecoder('utf8');
  const child = spawn(harness.executable, harness.args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  const stopper = groupStopper(child); // the group can outlive its leader while descendants retain pipes
  const { stop } = stopper;
  const collect = (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > OUTPUT_LIMIT_BYTES) {
      capped = true;
      stop();
      return;
    }
    output += decoder.write(chunk);
  };
  for (const stream of [child.stdout, child.stderr]) stream.on('data', collect);
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    stop();
  }, harness.timeoutMs).unref();
  if (signal?.aborted) stop();
  let exitCode: number | null;
  try {
    exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once('close', resolve);
      child.once('error', reject);
    });
  } finally {
    clearTimeout(timer);
    stopper.cancel();
    signal?.removeEventListener('abort', stop);
    output += decoder.end();
  }
  return { output, exitCode, capped, timedOut };
}
