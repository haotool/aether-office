import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import { assistantLine, textBlock, toolBlock, writeSubagent } from './fixtures/claude-subagents.js';

// A performance guard for the session scan on a machine with a long history: 2000 Codex rollouts and 40 Claude sessions
// holding 200 subagent transcripts (each 150 messages, all written a minute ago). The budgets are generous enough for a
// loaded CI machine; the numbers they guard are recorded in docs/verification (measured, not assumed).
const ROLLOUTS = 2000;
const CLAUDE_SESSIONS = 40;
const SUBAGENTS_PER_SESSION = 5;
const MESSAGES = 150;
const COLD_BUDGET_MS = 12_000;
const WARM_BUDGET_MS = 2_000;
const RSS_GROWTH_BUDGET = 300 * 1024 * 1024;
// AETHER_SCAN_BUDGET_SUBAGENTS=0 builds the same history without subagent files: the cost the new reads add to a scan with none.
const SUBAGENTS = process.env['AETHER_SCAN_BUDGET_SUBAGENTS'] === '0' ? 0 : SUBAGENTS_PER_SESSION;

async function build(home: string) {
  const minuteAgo = new Date(Date.now() - 60_000);
  const day = join(home, '.codex/sessions/2026/10/05');
  await mkdir(day, { recursive: true });
  for (let i = 0; i < ROLLOUTS; i++) {
    const id = `01a10000-0000-7000-8000-${String(i).padStart(12, '0')}`;
    const file = join(day, `rollout-t-${id}.jsonl`);
    const meta = { type: 'session_meta', payload: { id, cwd: home, source: 'exec' } };
    await writeFile(
      file,
      `${JSON.stringify(meta)}\n${'{"type":"event_msg","payload":{}}\n'.repeat(5)}`,
    );
    await utimes(file, new Date(Date.now() - i * 1000), new Date(Date.now() - i * 1000));
  }
  const dir = join(home, '.claude/projects/-synthetic');
  await mkdir(dir, { recursive: true });
  for (let s = 0; s < CLAUDE_SESSIONS; s++) {
    const parent = join(dir, `perf-${s}.jsonl`);
    await writeFile(
      parent,
      `${JSON.stringify({ type: 'user', cwd: home, message: { role: 'user', content: 'x' } })}\n`,
    );
    for (let a = 0; a < SUBAGENTS; a++) {
      const id = `p${s}x${a}`;
      const lines = Array.from({ length: MESSAGES }, (_, m) =>
        assistantLine(id, m % 3 ? textBlock(`message ${m}`) : toolBlock('Read'), minuteAgo),
      );
      await writeSubagent(parent, { id, at: minuteAgo, lines });
    }
  }
}

it(`scans ${ROLLOUTS} rollouts and ${CLAUDE_SESSIONS * SUBAGENTS} subagent files within budget, with bounded memory`, async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-budget-'));
  await build(home);
  const spool = join(home, 'none.jsonl');
  const timed = async () => {
    const started = performance.now();
    const sessions = await scanLocalSessions(home, Date.now(), 0, spool);
    return { ms: performance.now() - started, sessions };
  };
  resetLocalSessionCache();
  const rssBefore = process.memoryUsage().rss;
  const cold = await timed();
  const warm = await timed(); // heads, usage and subagent offsets are remembered
  const warm2 = await timed();
  const rssGrowth = process.memoryUsage().rss - rssBefore;

  const known = cold.sessions.flatMap((s) => s.subagents);
  if (process.env['AETHER_SCAN_BUDGET_OUT'])
    await writeFile(
      process.env['AETHER_SCAN_BUDGET_OUT'],
      JSON.stringify({
        coldMs: Math.round(cold.ms),
        warmMs: Math.round(warm.ms),
        warm2Ms: Math.round(warm2.ms),
        rssGrowthMb: Math.round(rssGrowth / 1e6),
        sessions: cold.sessions.length,
        subagents: known.length,
      }),
    );
  expect(cold.sessions.length).toBeGreaterThan(0);
  expect(cold.ms).toBeLessThan(COLD_BUDGET_MS);
  expect(warm.ms).toBeLessThan(WARM_BUDGET_MS);
  expect(warm2.ms).toBeLessThan(WARM_BUDGET_MS);
  expect(rssGrowth).toBeLessThan(RSS_GROWTH_BUDGET);
  await rm(home, { recursive: true, force: true });
}, 120_000);

it('bounds the first scan of very large subagent transcripts by a byte budget, then catches up without partial totals', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-budget-big-'));
  const dir = join(home, '.claude/projects/-synthetic');
  await mkdir(dir, { recursive: true });
  const minuteAgo = new Date(Date.now() - 60_000);
  const parent = join(dir, 'big.jsonl');
  await writeFile(
    parent,
    `${JSON.stringify({ type: 'user', cwd: home, message: { role: 'user', content: 'x' } })}\n`,
  );
  const MESSAGES_EACH = 5000; // about 3 MB a file; 16 files are more than the 32 MiB a scan may read
  const block = Array.from({ length: MESSAGES_EACH }, () =>
    assistantLine('b', textBlock('x'.repeat(500)), minuteAgo),
  ).join('');
  for (let a = 0; a < 16; a++)
    await writeSubagent(parent, { id: `big${a}`, at: minuteAgo, lines: [block] });
  resetLocalSessionCache();
  const totals = async () =>
    (await scanLocalSessions(home, Date.now(), 0, join(home, 'none.jsonl')))[0]!.subagents.map(
      (c) => c.tokens?.total ?? null,
    );
  const first = await totals();
  const done = (all: (number | null)[]) => all.filter((t) => t !== null);
  expect(done(first).length).toBeGreaterThan(0);
  expect(done(first).length).toBeLessThan(16); // the budget stopped the scan, the rest wait
  expect(done(first).every((t) => t === MESSAGES_EACH * 35)).toBe(true); // never a partial total
  let last = first;
  for (let scans = 0; scans < 3 && done(last).length < 16; scans++) last = await totals();
  expect(last).toEqual(Array(16).fill(MESSAGES_EACH * 35));
  await rm(home, { recursive: true, force: true });
}, 120_000);
