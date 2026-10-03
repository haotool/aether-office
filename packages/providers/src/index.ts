import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import type { RunCommand, Activity } from '@aether/contracts';
export type ProviderResult = {
  outcome: 'submitted' | 'failed' | 'cancelled' | 'indeterminate';
  summary: string;
  headSha?: string;
  review?: { decision: 'approve' | 'changes_requested'; body: string; headSha: string };
};
export type ProviderSink = {
  started: (sessionId: string, processIdentity: string) => Promise<void>;
  activity: (activity: Activity, summary: string) => Promise<void>;
};
const fixtureLine = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('activity'),
    activity: z.enum(['working', 'waiting_peer', 'reviewing']),
    summary: z.string().max(4000),
  }),
  z.object({
    type: z.literal('result'),
    outcome: z.enum(['submitted', 'failed']),
    summary: z.string().max(32000),
  }),
]);
export function processIdentity(child: Pick<ChildProcessWithoutNullStreams, 'pid'>): string {
  if (!child.pid) throw new Error('PROCESS_NOT_SPAWNED');
  const birth = execFileSync('ps', ['-p', String(child.pid), '-o', 'lstart='], {
    encoding: 'utf8',
    timeout: 2000,
  }).trim();
  if (!birth) throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
  return `${child.pid}:${birth}`;
}
export async function runFixture(
  command: RunCommand,
  sink: ProviderSink,
  signal: AbortSignal,
): Promise<ProviderResult> {
  if (command.mode !== 'demo' || command.provider !== 'demo') throw new Error('DEMO_MODE_REQUIRED');
  const child = spawn(process.execPath, [new URL('./fixture.mjs', import.meta.url).pathname], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env['PATH'] ?? '' },
    detached: process.platform !== 'win32',
  });
  let result: ProviderResult | undefined;
  let stderr = '';
  let buffer = '';
  let failed: Error | undefined;
  const decoder = new StringDecoder('utf8');
  const stop = () => {
    if (child.exitCode === null) child.kill('SIGTERM');
  };
  signal.addEventListener('abort', stop, { once: true });
  const timeout = setTimeout(stop, command.timeoutMs);
  timeout.unref();
  let chain = Promise.resolve();
  child.stdout.on('data', (bytes: Buffer) => {
    buffer += decoder.write(bytes);
    if (Buffer.byteLength(buffer) > 65536) {
      failed = new Error('PROVIDER_PAYLOAD_LIMIT');
      stop();
      return;
    }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      chain = chain
        .then(async () => {
          const event = fixtureLine.parse(JSON.parse(line));
          if (event.type === 'activity') await sink.activity(event.activity, event.summary);
          else {
            if (result) throw new Error('DUPLICATE_PROVIDER_RESULT');
            result = { outcome: event.outcome, summary: event.summary };
          }
        })
        .catch((error: unknown) => {
          failed = error instanceof Error ? error : new Error('PROVIDER_PROTOCOL_ERROR');
          stop();
        });
    }
  });
  child.stderr.on('data', (bytes: Buffer) => {
    stderr = (stderr + bytes.toString('utf8')).slice(-4000);
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    await sink.started(command.runId, processIdentity(child));
    if (signal.aborted) stop();
    else child.stdin.end(JSON.stringify(command) + '\n');
    const code = await exited;
    await chain;
    if (signal.aborted) return { outcome: 'cancelled', summary: 'Fixture cancelled by operator.' };
    if (failed) throw failed;
    if (code !== 0 || !result || buffer.trim())
      throw new Error(
        `FIXTURE_PROCESS_FAILED:${code}:${stderr ? 'stderr available' : 'no result'}`,
      );
    return result;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', stop);
    stop();
  }
}

export { CodexAdapter } from './codex.js';
export { ClaudeAdapter } from './claude.js';
export type { NativeSink, NativeOptions } from './protocol.js';
export { installHooksFile, removeHooksFile, HOOK_EVENTS } from './claude-hooks.js';
export {
  AcpAdapter,
  negotiationFrom,
  normalizeAcpUpdate,
  ACP_SDK_VERSION,
  type AcpNegotiation,
  type AcpVersions,
} from './acp.js';
export {
  assertClaudeVersion,
  assertCodexVersion,
  claudeRolloutVersion,
  codexRolloutVersion,
  codexVersion,
} from './compat.js';
