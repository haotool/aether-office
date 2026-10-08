import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

// Scan cost, counted instead of timed (a stopwatch assertion is flaky on a loaded machine and is off by default in
// scan-budget.test.ts): how many files a scan stats and opens. With a long history the work of a scan must follow the
// sessions it shows, not every transcript it can see, and a warm scan must not read what it has already read.
const calls = vi.hoisted(() => ({ stat: 0, open: 0 }));
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>();
  return {
    ...real,
    stat: (...args: Parameters<typeof real.stat>) => {
      calls.stat++;
      return real.stat(...args);
    },
    open: (...args: Parameters<typeof real.open>) => {
      calls.open++;
      return real.open(...args);
    },
  };
});
const { MAX_SESSIONS, resetLocalSessionCache, scanLocalSessions } =
  await import('../../apps/control/src/services/runtime/local-sessions.js');

const HISTORY = 600;

it('a scan opens files in proportion to the sessions it shows, not to the history, and a warm one reads almost nothing', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-work-'));
  const dir = join(home, '.claude/projects/-synthetic');
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  for (let i = 0; i < HISTORY; i++) {
    const file = join(dir, `s-${i}.jsonl`);
    await writeFile(
      file,
      `${JSON.stringify({ type: 'user', cwd: home, message: { role: 'user', content: 'x' } })}\n`,
    );
    const at = new Date(now - 60_000 - i * 1000);
    await utimes(file, at, at);
  }
  resetLocalSessionCache();
  const spool = join(home, 'none.jsonl');
  const measure = async () => {
    calls.stat = 0;
    calls.open = 0;
    const sessions = await scanLocalSessions(home, now, 0, spool);
    return { sessions: sessions.length, stat: calls.stat, open: calls.open };
  };
  const cold = await measure();
  const warm = await measure();
  expect(cold.sessions).toBe(MAX_SESSIONS);
  expect(warm.sessions).toBe(MAX_SESSIONS);
  // Listing a history costs about one stat per transcript (measured 1.4); twice that is a loop that grew.
  expect(cold.stat).toBeLessThan(HISTORY * 2);
  expect(warm.stat).toBeLessThan(HISTORY * 2);
  // Opening a file is the expensive part: only shown sessions are read, a handful of reads each, and heads are remembered.
  expect(cold.open).toBeLessThan(MAX_SESSIONS * 20); // measured 15 each
  expect(warm.open).toBeLessThanOrEqual(MAX_SESSIONS); // measured 0: nothing changed, nothing is read again
}, 60_000);
