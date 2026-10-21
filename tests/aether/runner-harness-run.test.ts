import { describe, expect, it } from 'vitest';
import { runHarnessProcess } from '../../apps/runner/src/harness-run.js';
import type { Harness } from '../../apps/runner/src/workspaces.js';

// Real child processes: the harness runner exists to contain them, so a stand-in would prove nothing.
const harness = (script: string, timeoutMs = 10_000): Harness => ({
  id: 'h',
  executable: process.execPath,
  args: ['-e', script],
  sourceFile: 'h.json',
  sourceHash: '0',
  hash: '0',
  timeoutMs,
});
const run = (script: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}) =>
  runHarnessProcess(harness(script, options.timeoutMs), process.cwd(), process.env, options.signal);
const HANG = 'setInterval(() => {}, 1000)';
const LEAVE = `const c = require("node:child_process").spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); ${HANG}"], { stdio: "ignore" }); c.unref(); process.stdout.write(String(c.pid))`;

describe('runHarnessProcess', () => {
  it('collects stdout and stderr and the exit code', async () => {
    const result = await run('console.log("out"); console.error("err"); process.exit(3)');
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain('out');
    expect(result.output).toContain('err');
    expect(result).toMatchObject({ capped: false, timedOut: false });
  });

  it('hands the process exactly the environment it was given', async () => {
    const result = await runHarnessProcess(
      harness(
        'process.stdout.write(String(process.env.AETHER_PROBE) + "|" + String(process.env.HOME))',
      ),
      process.cwd(),
      { AETHER_PROBE: 'yes', PATH: process.env['PATH'] },
    );
    expect(result.output).toBe('yes|undefined');
  });

  it('keeps multi-byte characters whole', async () => {
    const result = await run('process.stdout.write(Buffer.from("你好世界"))');
    expect(result.output).toBe('你好世界');
  });

  it('stops a process that runs past its timeout', async () => {
    const result = await run(HANG, { timeoutMs: 300 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('stops a process that floods its output past the limit, and keeps what came before', async () => {
    const result = await run(
      `process.stdout.write("first\\n"); setTimeout(() => { process.stdout.write(Buffer.alloc(1024 * 1024 + 10, 97)); ${HANG} }, 50)`,
    );
    expect(result.capped).toBe(true);
    expect(result.output.startsWith('first')).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(1024 * 1024);
  });

  it('stops on an abort signal, also one that was already aborted', async () => {
    const result = await run(HANG, { signal: AbortSignal.timeout(200) });
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
    const early = await run(HANG, { signal: AbortSignal.abort() });
    expect(early.exitCode).not.toBe(0);
  });

  it('leaves nothing of its process group running, also a child that ignores SIGTERM', async () => {
    const { output } = await run(LEAVE);
    expect(() => process.kill(Number(output), 0)).toThrow('ESRCH');
  });

  it('rejects when the executable cannot be started', async () => {
    await expect(
      runHarnessProcess(
        { ...harness(''), executable: '/definitely/not/here' },
        process.cwd(),
        process.env,
      ),
    ).rejects.toThrow();
  });
});
