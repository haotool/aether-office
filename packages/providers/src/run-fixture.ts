import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import type { RunCommand } from '@aether/contracts';
import { processIdentity } from './process-identity.js';
import type { ProviderResult, ProviderSink } from './index.js';

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

/** What the demo fixture process says: JSON lines on stdout, handled in order, and a tail of its stderr. */
class FixtureStream {
  result: ProviderResult | undefined;
  failed: Error | undefined;
  /** The part of stdout that is not yet a whole line. */
  buffer = '';
  stderr = '';
  private chain: Promise<void> = Promise.resolve();
  private readonly decoder = new StringDecoder('utf8');
  constructor(
    private readonly sink: ProviderSink,
    private readonly stop: () => void,
  ) {}

  stdout(bytes: Buffer) {
    this.buffer += this.decoder.write(bytes);
    if (Buffer.byteLength(this.buffer) > 65536) {
      this.failed = new Error('PROVIDER_PAYLOAD_LIMIT');
      this.stop();
      return;
    }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.chain = this.chain
        .then(() => this.handle(line))
        .catch((error: unknown) => {
          this.failed = error instanceof Error ? error : new Error('PROVIDER_PROTOCOL_ERROR');
          this.stop();
        });
    }
  }

  errors(bytes: Buffer) {
    this.stderr = (this.stderr + bytes.toString('utf8')).slice(-4000);
  }

  /** Resolves when every line read so far has been handled. */
  settled() {
    return this.chain;
  }

  private async handle(line: string) {
    const event = fixtureLine.parse(JSON.parse(line));
    if (event.type === 'activity') await this.sink.activity(event.activity, event.summary);
    else {
      if (this.result) throw new Error('DUPLICATE_PROVIDER_RESULT');
      this.result = { outcome: event.outcome, summary: event.summary };
    }
  }
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
  const stop = () => {
    if (child.exitCode === null) child.kill('SIGTERM');
  };
  signal.addEventListener('abort', stop, { once: true });
  const timeout = setTimeout(stop, command.timeoutMs);
  timeout.unref();
  const stream = new FixtureStream(sink, stop);
  child.stdout.on('data', (bytes: Buffer) => stream.stdout(bytes));
  child.stderr.on('data', (bytes: Buffer) => stream.errors(bytes));
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
    await stream.settled();
    if (signal.aborted) return { outcome: 'cancelled', summary: 'Fixture cancelled by operator.' };
    if (stream.failed) throw stream.failed;
    if (code !== 0 || !stream.result || stream.buffer.trim())
      throw new Error(
        `FIXTURE_PROCESS_FAILED:${code}:${stream.stderr ? 'stderr available' : 'no result'}`,
      );
    return stream.result;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', stop);
    stop();
  }
}
