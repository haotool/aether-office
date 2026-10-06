import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usageResponseSchema } from '../../packages/contracts/src/index.js';
import { windowDays, type Attribution } from '../../apps/control/src/services/usage-aggregate.js';
import { createUsageStats } from '../../apps/control/src/services/usage-stats.js';
import {
  claudeFile,
  claudeLine,
  codexContext,
  codexCount,
  codexFile,
  codexMeta,
  writeLines,
} from './usage-fixtures.js';

const NOW = Date.parse('2026-10-07T12:00:00Z');
let home: string;
let clock: number;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'aether-usage-'));
  clock = NOW;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const touch = (file: string, at = NOW - 60_000) => utimesSync(file, at / 1000, at / 1000);
const stats = (extra: Partial<Parameters<typeof createUsageStats>[0]> = {}) =>
  createUsageStats({ home, timeZone: 'UTC', now: () => clock, ...extra });
/** One full look: time moves on so the next scan is allowed, and the whole scan is awaited. */
async function look(
  s: ReturnType<typeof createUsageStats>,
  attributions = new Map<string, Attribution>(),
) {
  clock += 10_000;
  await s.refresh(10_000);
  return s.snapshot('30d', attributions, null);
}
const A = (department: string | null, repo = 'repo'): Attribution => ({ department, repo });

describe('incremental reading', () => {
  it('reads only appended bytes, and never counts a re-read twice', async () => {
    const file = claudeFile(home, 'sess-1');
    writeLines(file, [claudeLine('m1', '2026-10-07T01:00:00.000Z', { i: 10, o: 20 })]);
    touch(file);
    const s = stats();
    expect((await look(s)).building.totals).toMatchObject({ input: 10, output: 20, requests: 1 });
    const first = s.metrics.bytesRead;
    await look(s); // nothing changed: nothing read
    expect(s.metrics.bytesRead).toBe(first);
    writeLines(file, [claudeLine('m2', '2026-10-07T01:01:00.000Z', { i: 1, o: 2 })], true);
    touch(file, NOW - 30_000);
    const after = await look(s);
    expect(after.building.totals).toMatchObject({ input: 11, output: 22, requests: 2 });
    expect(s.metrics.bytesRead - first).toBeLessThan(first); // only the new line
  });

  it('waits for the rest of a line cut in half and counts it once complete', async () => {
    const file = claudeFile(home, 'sess-cut');
    const full = claudeLine('m1', '2026-10-07T01:00:00.000Z', { i: 5, o: 5 });
    writeLines(file, [claudeLine('m0', '2026-10-07T00:59:00.000Z', { i: 1, o: 1 })]);
    appendFileSync(file, full.slice(0, 200)); // the writer is mid-line
    touch(file);
    const s = stats();
    expect((await look(s)).building.totals.input).toBe(1);
    appendFileSync(file, full.slice(200) + '\n');
    touch(file, NOW - 20_000);
    expect((await look(s)).building.totals).toMatchObject({ input: 6, requests: 2 });
  });

  it('starts over when a file is rewritten or truncated, instead of adding to stale numbers', async () => {
    const file = claudeFile(home, 'sess-2');
    writeLines(file, [
      claudeLine('m1', '2026-10-07T01:00:00.000Z', { i: 10, o: 10 }),
      claudeLine('m2', '2026-10-07T01:01:00.000Z', { i: 10, o: 10 }),
    ]);
    touch(file);
    const s = stats();
    expect((await look(s)).building.totals.input).toBe(20);
    writeLines(file, [claudeLine('other', '2026-10-07T02:00:00.000Z', { i: 3, o: 4 })]); // rewritten, shorter
    touch(file, NOW - 30_000);
    expect((await look(s)).building.totals).toMatchObject({ input: 3, output: 4 });
    const text = claudeLine('z1', '2026-10-07T03:00:00.000Z', { i: 100, o: 1 });
    writeLines(file, [text, claudeLine('z2', '2026-10-07T03:01:00.000Z', { i: 100, o: 1 })]);
    touch(file, NOW - 20_000);
    expect((await look(s)).building.totals.input).toBe(200);
    truncateSync(file, text.length + 1); // cut back to the first record
    touch(file, NOW - 10_000);
    expect((await look(s)).building.totals.input).toBe(100);
  });

  it('forgets a transcript that is gone', async () => {
    const file = claudeFile(home, 'sess-3');
    writeLines(file, [claudeLine('m', '2026-10-07T01:00:00.000Z', { i: 9, o: 1 })]);
    touch(file);
    const s = stats();
    expect((await look(s)).building.totals.input).toBe(9);
    rmSync(file);
    expect((await look(s)).building.totals.input).toBe(0);
  });
});

describe('the rollup on disk', () => {
  const cacheFile = () => join(home, 'usage-rollup.json');
  const seed = () => {
    const file = claudeFile(home, 'sess-4');
    writeLines(file, [claudeLine('m', '2026-10-07T01:00:00.000Z', { i: 9, o: 1 }, { tools: 1 })]);
    touch(file);
  };

  it('spares a restart from reading history again, and holds numbers only', async () => {
    seed();
    const first = stats({ cacheFile: cacheFile() });
    await look(first);
    await first.flush();
    const text = readFileSync(cacheFile(), 'utf8');
    expect(text).not.toContain(home); // no path
    expect(text).not.toContain('sess-4');
    const second = stats({ cacheFile: cacheFile() });
    const snapshot = await look(second);
    expect(second.metrics.bytesRead).toBe(0);
    expect(snapshot.building.totals).toMatchObject({ input: 9, output: 1, toolCalls: 1 });
  });

  it('ignores a rollup written for another zone or version and reads again', async () => {
    seed();
    const first = stats({ cacheFile: cacheFile() });
    await look(first);
    await first.flush();
    const other = stats({ cacheFile: cacheFile(), timeZone: 'Asia/Taipei' });
    await look(other);
    expect(other.metrics.bytesRead).toBeGreaterThan(0);
    writeFileSync(cacheFile(), '{"v":0,"tz":"UTC","entries":{}}');
    const stale = stats({ cacheFile: cacheFile() });
    await look(stale);
    expect(stale.metrics.bytesRead).toBeGreaterThan(0);
    writeFileSync(cacheFile(), 'not json');
    expect((await look(stats({ cacheFile: cacheFile() }))).building.totals.input).toBe(9);
  });
});

describe('grouping', () => {
  it('assigns usage to the office of its session, the rest to "unplaced", and a sub-agent to its parent', async () => {
    writeLines(claudeFile(home, 'dev'), [
      claudeLine('a', '2026-10-07T01:00:00.000Z', { i: 100, o: 50 }),
    ]);
    writeLines(claudeFile(home, 'qa'), [
      claudeLine('b', '2026-10-07T01:00:00.000Z', { i: 10, o: 5 }),
    ]);
    writeLines(claudeFile(home, 'old'), [
      claudeLine('c', '2026-10-07T01:00:00.000Z', { i: 1, o: 1 }),
    ]);
    // a sub-agent's own transcript belongs to the session folder it sits in
    writeLines(join(home, '.claude/projects/-work-repo/dev/subagents/agent-x.jsonl'), [
      claudeLine('d', '2026-10-07T01:05:00.000Z', { i: 7, o: 3 }),
    ]);
    for (const f of ['dev', 'qa', 'old']) touch(claudeFile(home, f));
    touch(join(home, '.claude/projects/-work-repo/dev/subagents/agent-x.jsonl'));
    const snapshot = await look(
      stats(),
      new Map([
        ['claude:dev', A('product', 'web')],
        ['claude:qa', A('quality', 'api')],
      ]),
    );
    const office = (name: string) =>
      snapshot.offices.find((o) => o.department === name)!.scope.totals;
    expect(office('product')).toMatchObject({ input: 107, output: 53, sessions: 1 });
    expect(office('quality')).toMatchObject({ input: 10, output: 5 });
    expect(snapshot.unplaced.totals).toMatchObject({ input: 1, output: 1 });
    expect(snapshot.building.totals.input).toBe(118);
    expect(snapshot.offices.map((o) => o.floor)).toEqual([0, 1, 2, 3, 4]);
    expect(snapshot.projects.map((p) => p.repo)).toEqual(['web', 'api', 'repo']);
    expect(snapshot.sessions[0]).toMatchObject({
      key: 'claude:dev',
      tokens: 160,
      department: 'product',
    });
    expect(usageResponseSchema.parse(snapshot)).toBeTruthy();
  });

  it('buckets by the local day, the same event on different days in different zones', async () => {
    const file = claudeFile(home, 'late');
    writeLines(file, [claudeLine('a', '2026-10-06T17:30:00.000Z', { i: 5, o: 5 })]);
    touch(file);
    const inUtc = await look(stats());
    const inTaipei = await look(stats({ timeZone: 'Asia/Taipei' }));
    const index = (r: typeof inUtc, day: string) => r.days.indexOf(day);
    expect(inUtc.building.daily[index(inUtc, '2026-10-06')]!.input).toBe(5);
    expect(inTaipei.building.daily[index(inTaipei, '2026-10-07')]!.input).toBe(5);
    expect(inTaipei.days.at(-1)).toBe('2026-10-07');
    expect(inTaipei.timezone).toBe('Asia/Taipei');
  });

  it('answers a range from the same days: today is the last of the window, 7d its last seven', async () => {
    const file = claudeFile(home, 'range');
    writeLines(file, [
      claudeLine('a', '2026-10-07T01:00:00.000Z', { i: 1, o: 0 }),
      claudeLine('b', '2026-10-03T01:00:00.000Z', { i: 10, o: 0 }),
      claudeLine('c', '2026-09-15T01:00:00.000Z', { i: 100, o: 0 }),
    ]);
    touch(file);
    const s = stats();
    await look(s);
    const input = async (range: 'today' | '7d' | '30d') =>
      (await s.snapshot(range, new Map(), null)).building.totals.input;
    expect([await input('today'), await input('7d'), await input('30d')]).toEqual([1, 11, 111]);
    expect(windowDays('2026-03-01').at(-2)).toBe('2026-02-28'); // calendar arithmetic, not 24-hour steps
  });
});

describe('Codex sessions and limits', () => {
  it('reads a rollout, its tokens and the freshest rate-limit windows', async () => {
    const file = codexFile(home, '019d0000-0000-7000-8000-000000000001');
    writeLines(file, [
      codexMeta('2026-10-07T01:00:00.000Z'),
      codexContext('2026-10-07T01:00:01.000Z', 'gpt-5.5'),
      codexCount(
        '2026-10-07T01:00:10.000Z',
        { input: 1000, cached: 600, output: 100, reasoning: 40 },
        { input: 1000, cached: 600, output: 100, reasoning: 40 },
        true,
      ),
    ]);
    touch(file);
    const snapshot = await look(
      stats(),
      new Map([['codex:019d0000-0000-7000-8000-000000000001', A('data')]]),
    );
    expect(snapshot.offices.find((o) => o.department === 'data')!.scope.totals).toMatchObject({
      input: 400,
      cacheRead: 600,
      output: 60,
      reasoning: 40,
    });
    expect(snapshot.limits.codex).toMatchObject({
      plan: 'pro',
      windows: [
        { minutes: 300, usedPercent: 41.5 },
        { minutes: 10080, usedPercent: 12 },
      ],
    });
    expect(snapshot.providers.find((p) => p.provider === 'codex')!.totals.reasoning).toBe(40);
  });
});

describe('bounds', () => {
  it('cold-scans 500 files within budget without starving the event loop', async () => {
    for (let n = 0; n < 500; n++) {
      const file = claudeFile(home, `perf-${n}`, `-p${n % 20}`);
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
    clock += 10_000;
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
      const file = claudeFile(home, `slow-${n}`);
      writeLines(file, [claudeLine(`m${n}`, '2026-10-07T01:00:00.000Z', { i: 1, o: 1 })]);
      touch(file);
    }
    const s = stats();
    clock += 10_000;
    await s.refresh(0);
    const early = await s.snapshot('30d', new Map(), null);
    expect(early.scan.complete).toBe(false);
    await s.refresh(10_000);
    expect((await s.snapshot('30d', new Map(), null)).scan.complete).toBe(true);
  });

  it('keeps no more files than its cap', async () => {
    for (let n = 0; n < 12; n++) {
      const file = claudeFile(home, `cap-${n}`);
      writeLines(file, [claudeLine(`m${n}`, '2026-10-07T01:00:00.000Z', { i: 1, o: 1 })]);
      touch(file, NOW - 60_000 - n * 1000);
    }
    expect((await look(stats({ maxFiles: 5 }))).scan.files).toBe(5);
  });
});
