import { describe, expect, it } from 'vitest';
import { claudeFile, claudeLine, writeLines } from './usage-fixtures.js';
import { NOW, touch, usageEnv } from './usage-stats-env.js';

const { env, stats, look } = usageEnv();

describe('bounds', () => {
  it('cold-scans 500 files within budget without starving the event loop', async () => {
    for (let n = 0; n < 500; n++) {
      const file = claudeFile(env.home, `perf-${n}`, `-p${n % 20}`);
      writeLines(
        file,
        Array.from({ length: 40 }, (_, k) =>
          claudeLine(
            `m${n}-${k}`,
            `2026-10-07T01:${String(k).padStart(2, '0')}:00.000Z`,
            { i: 3, cr: 900, o: 7 },
            { tools: 1 },
          ),
        ),
      );
      touch(file);
    }
    const s = stats();
    let worstGap = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      worstGap = Math.max(worstGap, now - last);
      last = now;
    }, 5);
    const started = performance.now();
    env.clock += 10_000;
    await s.refresh(60_000);
    const took = performance.now() - started;
    clearInterval(timer);
    const snapshot = await s.snapshot('30d', new Map(), null);
    expect(snapshot.scan).toMatchObject({ complete: true, files: 500, pending: 0 });
    expect(snapshot.building.totals).toMatchObject({ input: 500 * 40 * 3, requests: 500 * 40 });
    expect(took).toBeLessThan(8000);
    // The loop kept turning while the scan ran (a scan that never yielded would hold it for the whole of `took`).
    expect(worstGap).toBeLessThan(Math.max(500, took / 2));
  }, 30_000);

  it('answers at once with a partial result while a slow scan is still reading, and says so', async () => {
    for (let n = 0; n < 200; n++) {
      const file = claudeFile(env.home, `slow-${n}`);
      writeLines(file, [claudeLine(`m${n}`, '2026-10-07T01:00:00.000Z', { i: 1, o: 1 })]);
      touch(file);
    }
    const s = stats();
    env.clock += 10_000;
    await s.refresh(0);
    const early = await s.snapshot('30d', new Map(), null);
    expect(early.scan.complete).toBe(false);
    await s.refresh(10_000);
    expect((await s.snapshot('30d', new Map(), null)).scan.complete).toBe(true);
  });

  it('keeps no more files than its cap', async () => {
    for (let n = 0; n < 12; n++) {
      const file = claudeFile(env.home, `cap-${n}`);
      writeLines(file, [claudeLine(`m${n}`, '2026-10-07T01:00:00.000Z', { i: 1, o: 1 })]);
      touch(file, NOW - 60_000 - n * 1000);
    }
    expect((await look(stats({ maxFiles: 5 }))).scan.files).toBe(5);
  });
});
