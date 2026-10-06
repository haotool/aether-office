import { mkdir, mkdtemp, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import { plainSummary } from '../../apps/control/src/services/subagent-text.js';
import { readSubagentUsage } from '../../apps/control/src/services/subagent-usage.js';
import {
  FRESH_PER_MESSAGE,
  append,
  assistantLine,
  textBlock,
  toolBlock,
  toolResultLine,
  writeSession,
  writeSubagent,
} from './fixtures/claude-subagents.js';

const NOW = () => Date.now();
const ago = (ms: number) => new Date(Date.now() - ms);
const scan = async (home: string, spool = join(home, 'no-spool.jsonl')) => {
  resetLocalSessionCache();
  return (await scanLocalSessions(home, NOW(), 0, spool))[0]!;
};
const SECRET = 'ghp_EXAMPLE_NOT_A_SECRET';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'aether-subtx-'));
});

describe('subagents known from their own transcript files', () => {
  it('shows a hook-less subagent as running, with its type, label, tools, tokens and start', async () => {
    const parent = await writeSession(home);
    await writeSubagent(parent, {
      id: 'a1b2c3',
      type: 'Explore',
      description: 'Find the call sites',
      lines: [
        assistantLine('a1b2c3', toolBlock('Read'), ago(30_000)),
        assistantLine('a1b2c3', toolBlock('Grep'), ago(20_000)),
        assistantLine('a1b2c3', textBlock('still going'), ago(10_000)),
      ],
    });
    const [child] = (await scan(home)).subagents;
    expect(child).toMatchObject({
      id: 'a1b2c3',
      type: 'Explore',
      source: 'transcript',
      status: 'running',
      endedAt: null,
      label: 'Find the call sites',
      nickname: null,
      result: null,
      tools: { count: 2, last: 'Grep' },
      tokens: { total: 3 * FRESH_PER_MESSAGE, perMinute: 0 },
    });
    expect(child!.startedAt).toBeGreaterThan(0);
    expect(child!.tools!.lastAt).toBeGreaterThan(0);
    expect(child!.lastSeen).toBeGreaterThan(Date.now() - 5000);
  });

  it('marks it finished after two quiet minutes, with a plain, redacted, bounded result', async () => {
    const parent = await writeSession(home);
    const words = `## Done\n\n**Found** it in \`pkg/a.ts\`: <script>alert(1)</script> token=${SECRET}. ${'More. '.repeat(80)}`;
    await writeSubagent(parent, {
      id: 'fin1',
      at: ago(3 * 60_000),
      lines: [assistantLine('fin1', textBlock(words), ago(3 * 60_000))],
    });
    const [child] = (await scan(home)).subagents;
    expect(child).toMatchObject({ status: 'finished', source: 'transcript' });
    expect(child!.endedAt).toBeGreaterThan(0);
    const summary = child!.result!.summary;
    expect(summary.length).toBeLessThanOrEqual(160);
    expect(summary).toContain('Found');
    expect(summary).not.toMatch(/[#*`]|<script|alert\(1\)/);
    expect(JSON.stringify(child)).not.toContain(SECRET);
    expect(child!.result!.chars).toBe(words.trim().length);
    expect(child!.result!.error).toBeNull(); // the parent's own result for the call is not in this transcript
  });

  it('drops it after the grace period, and ignores files that are not agent transcripts', async () => {
    const parent = await writeSession(home);
    await writeSubagent(parent, { id: 'old1', at: ago(4 * 60_000), lines: [] });
    await writeFile(join(parent.replace(/\.jsonl$/, ''), 'subagents', 'notes.jsonl'), '{}\n');
    expect((await scan(home)).subagents).toEqual([]);
  });

  it('does not follow links to a subagents folder or a file', async () => {
    const parent = await writeSession(home);
    const outside = await mkdtemp(join(tmpdir(), 'aether-outside-'));
    await mkdir(join(outside, 'subagents'));
    await writeFile(
      join(outside, 'subagents', 'agent-evil.jsonl'),
      assistantLine('evil', textBlock(`private ${SECRET}`), new Date()),
    );
    await symlink(outside, parent.replace(/\.jsonl$/, ''));
    expect((await scan(home)).subagents).toEqual([]);
    const second = await writeSession(home, 'sess-2');
    const dir = join(second.replace(/\.jsonl$/, ''), 'subagents');
    await writeSubagent(second, { id: 'real', lines: [] });
    await symlink(join(outside, 'subagents', 'agent-evil.jsonl'), join(dir, 'agent-link.jsonl'));
    resetLocalSessionCache();
    const sessions = await scanLocalSessions(home, NOW(), 0, join(home, 'none.jsonl'));
    const ids = sessions.flatMap((s) => s.subagents.map((c) => c.id));
    expect(ids).toEqual(['real']);
    expect(JSON.stringify(sessions)).not.toContain(SECRET);
  });

  it('leaves no piece of a secret when markup hides or splits it before the cut', () => {
    const token = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4';
    const comment = `<!--${'y'.repeat(11_975)}--> ${token}`;
    const split = `${'word '.repeat(31)}ghp_A1b2C3d4**E5f6G7h8I9j0K1l2M3n4** tail`;
    for (const text of [comment, split, `${'x '.repeat(80)}${token}`])
      expect(plainSummary(text, 160)).not.toMatch(/ghp_/);
  });

  it('sanitizes a hostile meta file: odd type, oversized or secret-bearing description', async () => {
    const parent = await writeSession(home);
    await writeSubagent(parent, {
      id: 'meta1',
      type: '<img src=x onerror=alert(1)>',
      description: `Use ${SECRET} to **deploy** <b>now</b> ${'x'.repeat(5000)}`,
      lines: [],
    });
    const [child] = (await scan(home)).subagents;
    expect(child!.type).toBe('subagent');
    expect(child!.label!.length).toBeLessThanOrEqual(60);
    expect(JSON.stringify(child)).not.toContain(SECRET);
    expect(child!.label).not.toMatch(/[<>*]/);
  });

  it('tells error from success only through the parent’s own tool result', async () => {
    const parent = await writeSession(home);
    const done = ago(3 * 60_000);
    const make = (id: string, shape: 'foreground' | 'background') =>
      writeSubagent(parent, {
        id,
        at: done,
        toolUseId: `toolu_${id}`,
        requestShape: shape,
        lines: [assistantLine(id, textBlock('report'), done)],
      });
    await make('failed', 'background');
    await make('fgok', 'foreground');
    await make('bgok', 'background');
    await make('nores', 'foreground');
    await append(
      parent,
      toolResultLine('toolu_failed', true) +
        toolResultLine('toolu_fgok', false) +
        toolResultLine('toolu_bgok', false),
      new Date(),
    );
    const found = Object.fromEntries(
      (await scan(home)).subagents.map((c) => [c.id, c.result?.error]),
    );
    expect(found).toEqual({ failed: true, fgok: false, bgok: null, nores: null });
  });
});

describe('joining hooks and files', () => {
  const hook = (event: string, at: number, extra: object = {}) =>
    JSON.stringify({
      at,
      provider: 'claude',
      event,
      sessionId: 'sess-1',
      cwd: '/synthetic',
      agentId: 'ag1',
      agentType: 'Explore',
      ...extra,
    });

  it('matches a file to its hook records by agent id: the hook keeps lifecycle, the file adds facts', async () => {
    const parent = await writeSession(home);
    const t = Date.now();
    await writeSubagent(parent, {
      id: 'ag1',
      at: ago(1000),
      description: 'Survey the module',
      lines: [assistantLine('ag1', toolBlock('Read'), ago(1000))],
    });
    await writeSubagent(parent, { id: 'other', lines: [] }); // a file with no hook record stands alone
    const spool = join(home, 'spool.jsonl');
    await writeFile(
      spool,
      [
        hook('SubagentStart', t - 5000),
        hook('PreToolUse', t - 4000, { tool: 'Read' }),
        hook('PermissionRequest', t - 500),
      ].join('\n') + '\n',
    );
    const kids = Object.fromEntries((await scan(home, spool)).subagents.map((c) => [c.id, c]));
    expect(kids['ag1']).toMatchObject({
      source: 'hook',
      status: 'waiting_permission', // only the hook saw the permission request
      label: 'Survey the module',
      tools: { count: 1, last: 'Read' }, // the hook's own count wins
      tokens: { total: FRESH_PER_MESSAGE },
      result: null, // not finished yet: no result
    });
    expect(kids['other']).toMatchObject({ source: 'transcript', status: 'running' });
  });

  it('shows the result of a hook-finished subagent at once, before the quiet period', async () => {
    const parent = await writeSession(home);
    const t = Date.now();
    await writeSubagent(parent, {
      id: 'ag1',
      at: ago(500),
      lines: [assistantLine('ag1', textBlock('All three call sites are in a.ts.'), ago(500))],
    });
    const spool = join(home, 'spool.jsonl');
    await writeFile(
      spool,
      [hook('SubagentStart', t - 5000), hook('SubagentStop', t - 400)].join('\n') + '\n',
    );
    const [child] = (await scan(home, spool)).subagents;
    expect(child).toMatchObject({ status: 'finished', source: 'hook' });
    expect(child!.result).toEqual({
      summary: 'All three call sites are in a.ts.',
      error: null,
      chars: 33,
    });
  });
});

describe('token usage is read incrementally, within a budget, and never partial', () => {
  it('counts only what a file gained, and measures a rate between scans', async () => {
    const parent = await writeSession(home);
    const file = await writeSubagent(parent, {
      id: 'rate1',
      lines: [assistantLine('rate1', toolBlock('Read'), ago(60_000))],
    });
    const budget = { bytes: 10_000_000 };
    const t0 = 1_000_000;
    const size = () => stat(file).then((s) => s.size);
    const first = await readSubagentUsage(file, await size(), t0, budget);
    expect(first).toEqual({ total: FRESH_PER_MESSAGE, tools: 1, perMinute: 0 });
    const more = assistantLine('rate1', toolBlock('Edit'), new Date()).repeat(1);
    await append(file, more);
    const second = await readSubagentUsage(file, await size(), t0 + 30_000, budget);
    expect(second).toMatchObject({ total: 2 * FRESH_PER_MESSAGE, tools: 2 });
    expect(second!.perMinute).toBe(FRESH_PER_MESSAGE * 2); // 35 tokens in half a minute
  });

  it('reports null, not a partial total, while the byte budget has not reached a file', async () => {
    const parent = await writeSession(home);
    const lines = Array.from({ length: 40 }, (_, i) =>
      assistantLine('big1', toolBlock('Read'), ago(60_000 - i)),
    );
    const file = await writeSubagent(parent, { id: 'big1', lines });
    const { size } = await stat(file);
    expect(await readSubagentUsage(file, size, NOW(), { bytes: 100 })).toBeNull();
    const caught = await readSubagentUsage(file, size, NOW() + 1, { bytes: size });
    expect(caught).toMatchObject({ total: 40 * FRESH_PER_MESSAGE, tools: 40 });
  });
});
