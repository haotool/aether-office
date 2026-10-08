import { appendFileSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { usageResponseSchema } from '../../packages/contracts/src/index.js';
import { windowDays } from '../../apps/control/src/services/usage-aggregate.js';
import { claudeFile, claudeLine, writeLines } from './usage-fixtures.js';
import { A, NOW, touch, usageEnv } from './usage-stats-env.js';

const { env, stats, look } = usageEnv();

describe('incremental reading', () => {
  it('reads only appended bytes, and never counts a re-read twice', async () => {
    const file = claudeFile(env.home, 'sess-1');
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
    const file = claudeFile(env.home, 'sess-cut');
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
    const file = claudeFile(env.home, 'sess-2');
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

  it('counts a transcript that appears right after a pass on the very next request, not a gap later', async () => {
    const first = claudeFile(env.home, 'sess-a');
    writeLines(first, [claudeLine('m1', '2026-10-07T01:00:00.000Z', { i: 10, o: 1 })]);
    touch(first);
    const s = stats();
    expect((await look(s)).scan).toMatchObject({ complete: true, files: 1 });
    const second = claudeFile(env.home, 'sess-b');
    writeLines(second, [claudeLine('m2', '2026-10-07T01:01:00.000Z', { i: 5, o: 1 })]);
    touch(second);
    env.clock += 50; // the request comes 50 ms after the pass: a cheap pass does not make it wait for a time gap
    await s.refresh(400);
    const answer = await s.snapshot('30d', new Map(), null);
    expect(answer.scan).toMatchObject({ complete: true, files: 2 });
    expect(answer.building.totals.input).toBe(15);
  });

  it('forgets a transcript that is gone', async () => {
    const file = claudeFile(env.home, 'sess-3');
    writeLines(file, [claudeLine('m', '2026-10-07T01:00:00.000Z', { i: 9, o: 1 })]);
    touch(file);
    const s = stats();
    expect((await look(s)).building.totals.input).toBe(9);
    rmSync(file);
    expect((await look(s)).building.totals.input).toBe(0);
  });
});

describe('the rollup on disk', () => {
  const cacheFile = () => join(env.home, 'usage-rollup.json');
  const seed = () => {
    const file = claudeFile(env.home, 'sess-4');
    writeLines(file, [claudeLine('m', '2026-10-07T01:00:00.000Z', { i: 9, o: 1 }, { tools: 1 })]);
    touch(file);
  };

  it('spares a restart from reading history again, and holds numbers only', async () => {
    seed();
    const first = stats({ cacheFile: cacheFile() });
    await look(first);
    await first.flush();
    const text = readFileSync(cacheFile(), 'utf8');
    expect(text).not.toContain(env.home); // no path
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
    writeLines(claudeFile(env.home, 'dev'), [
      claudeLine('a', '2026-10-07T01:00:00.000Z', { i: 100, o: 50 }),
    ]);
    writeLines(claudeFile(env.home, 'qa'), [
      claudeLine('b', '2026-10-07T01:00:00.000Z', { i: 10, o: 5 }),
    ]);
    writeLines(claudeFile(env.home, 'old'), [
      claudeLine('c', '2026-10-07T01:00:00.000Z', { i: 1, o: 1 }),
    ]);
    // a sub-agent's own transcript belongs to the session folder it sits in
    writeLines(join(env.home, '.claude/projects/-work-repo/dev/subagents/agent-x.jsonl'), [
      claudeLine('d', '2026-10-07T01:05:00.000Z', { i: 7, o: 3 }),
    ]);
    for (const f of ['dev', 'qa', 'old']) touch(claudeFile(env.home, f));
    touch(join(env.home, '.claude/projects/-work-repo/dev/subagents/agent-x.jsonl'));
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
    // Offices plus what no office holds are the building: the page can say so.
    const placed = snapshot.offices.reduce((n, o) => n + o.scope.totals.input, 0);
    expect(placed + snapshot.unplaced.totals.input).toBe(snapshot.building.totals.input);
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
    const file = claudeFile(env.home, 'late');
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
    const file = claudeFile(env.home, 'range');
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
