import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export const timingTests = process.env['AETHER_TIMING_TESTS'] === '1';

/** `tight` with timing tests on; otherwise `loose`, a bound that still fails if the code under test hangs or never yields. */
export const budget = (tight: number, loose: number) => (timingTests ? tight : loose);

/** A port nothing listens on right now, from the kernel's ephemeral range: never a number picked by hand. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

export async function eventually<T>(
  read: () => T | undefined | false | Promise<T | undefined | false>,
  ms = 30_000,
  what = 'the condition',
): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await delay(25)) {
    const value = await read();
    if (value) return value;
  }
  throw new Error(`TIMED_OUT_WAITING_FOR ${what}`);
}
