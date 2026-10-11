import { chmodSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listTranscripts } from '../../apps/control/src/services/usage/usage-files.js';
import {
  claudeFile,
  claudeLine,
  codexContext,
  codexCount,
  codexFile,
  codexMeta,
  writeLines,
} from './usage-fixtures.js';
import { A, NOW, touch, usageEnv } from './usage-stats-env.js';

const { env, stats, look } = usageEnv();

describe('Codex subagents', () => {
  it('counts a spawned rollout as part of its parent session, in the parent’s office', async () => {
    const parentId = '019d0000-0000-7000-8000-0000000000aa';
    const childId = '019d0000-0000-7000-8000-0000000000bb';
    const count = (at: string) =>
      codexCount(at, { input: 100, output: 10 }, { input: 100, output: 10 });
    const parent = codexFile(env.home, parentId);
    const child = codexFile(env.home, childId);
    writeLines(parent, [codexMeta('2026-10-07T01:00:00.000Z'), count('2026-10-07T01:00:10.000Z')]);
    writeLines(child, [
      JSON.stringify({
        timestamp: '2026-10-07T01:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: childId,
          cwd: '/work/repo',
          source: { subagent: { thread_spawn: { parent_thread_id: parentId, agent_role: 'x' } } },
        },
      }),
      count('2026-10-07T01:00:20.000Z'),
    ]);
    touch(parent);
    touch(child);
    const snapshot = await look(stats(), new Map([[`codex:${parentId}`, A('data')]]));
    expect(snapshot.building.totals.sessions).toBe(1);
    expect(snapshot.offices.find((o) => o.department === 'data')!.scope.totals).toMatchObject({
      input: 200,
      output: 20,
      sessions: 1,
    });
    expect(snapshot.unplaced.totals.input).toBe(0);
  });
});

describe('Codex sessions and limits', () => {
  it('reads a rollout, its tokens and the freshest rate-limit windows', async () => {
    const file = codexFile(env.home, '019d0000-0000-7000-8000-000000000001');
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

describe('what the numbers may be missing', () => {
  const T = '2026-10-07T01:00:00.000Z';
  const line = (id: string, input = 1) => claudeLine(id, T, { i: input, o: 1 });

  it('counts one message once across two copies of a transcript (a resume), whichever is newer', async () => {
    const original = claudeFile(env.home, 'orig');
    const copy = claudeFile(env.home, 'copy');
    writeLines(original, [line('a', 10), line('b', 10)]);
    writeLines(copy, [line('a', 10), line('b', 10), line('c', 10)]);
    touch(original, NOW - 120_000);
    touch(copy, NOW - 60_000);
    const snapshot = await look(stats());
    expect(snapshot.building.totals).toMatchObject({ input: 30, requests: 3 });
  });

  it('reports truncation when the file cap is hit, with the real count, dropping the oldest', async () => {
    for (let n = 0; n < 6; n++) {
      const file = claudeFile(env.home, `cap-${n}`);
      writeLines(file, [line(`m${n}`, n + 1)]);
      touch(file, NOW - 60_000 - n * 1000);
    }
    const snapshot = await look(stats({ maxFiles: 4 }));
    expect(snapshot.scan).toMatchObject({ files: 4, found: 6, truncated: true });
    expect(snapshot.building.totals.input).toBe(1 + 2 + 3 + 4);
    expect((await look(stats())).scan).toMatchObject({ found: 6, truncated: false });
  });

  it('lists claude projects newest first under a spent budget, not by folder name', async () => {
    const old = claudeFile(env.home, 'old', '-zzz-oldest-project');
    const fresh = claudeFile(env.home, 'new', '-aaa-newest-project');
    writeLines(old, [line('o')]);
    writeLines(fresh, [line('n')]);
    touch(old, NOW - 20 * 86_400_000);
    touch(fresh, NOW - 60_000);
    utimesSync(
      join(env.home, '.claude/projects/-zzz-oldest-project'),
      (NOW - 20 * 86_400_000) / 1000,
      (NOW - 20 * 86_400_000) / 1000,
    );
    utimesSync(
      join(env.home, '.claude/projects/-aaa-newest-project'),
      (NOW - 60_000) / 1000,
      (NOW - 60_000) / 1000,
    );
    const listing = await listTranscripts(env.home, NOW, 30 * 86_400_000, 100, 2);
    expect(listing.truncated).toBe(true);
    expect(listing.transcripts.map((t) => t.sessionKey)).toEqual(['claude:new']);
    expect((await listTranscripts(env.home, NOW, 30 * 86_400_000, 100)).truncated).toBe(false);
  });

  it('reports unreadable files and skipped lines in the scan', async () => {
    const bad = claudeFile(env.home, 'bad');
    writeLines(bad, [line('a').replace('"timestamp"', '"stamp"')]);
    touch(bad);
    expect((await look(stats())).scan).toMatchObject({ skippedLines: 1, failedFiles: 0 });
    const locked = claudeFile(env.home, 'locked');
    writeLines(locked, [line('l')]);
    touch(locked);
    chmodSync(locked, 0);
    expect((await look(stats())).scan).toMatchObject({ skippedLines: 1, failedFiles: 1 });
  });

  it('reads a file replaced in place with the same start and a larger size again, not as an append', async () => {
    const file = claudeFile(env.home, 'swap');
    const head = line('h', 5);
    writeLines(file, [head, line('x1', 100)]);
    touch(file);
    const s = stats();
    expect((await look(s)).building.totals.input).toBe(105);
    writeLines(file, [head, line('y1', 7), line('y2', 7)]);
    touch(file, NOW - 30_000);
    expect((await look(s)).building.totals.input).toBe(5 + 7 + 7);
  });
});
