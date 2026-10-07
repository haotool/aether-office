// Where the squad beam's reference rates come from: the distribution of per-minute rates in real transcripts, numbers only.
//
//   node --import tsx scripts/beam-calibration.ts [--claude ~/.claude/projects] [--codex ~/.codex/sessions] [--codex-files 300]
//
// Read-only and bounded: Claude subagent files (`<project>/<session>/subagents/agent-*.jsonl`) and the newest Codex rollouts
// are read once through the same counters the app uses (`usage-parse.ts`: fresh tokens = input + output + cache writes, never
// cache reads; tool calls), bucketed by minute. No message text is decoded or printed. An "active minute" is one with any
// tokens or tool calls. The squad rate is what the beam shows: the subagents of one parent session summed per minute.
import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fresh, newState } from '../apps/control/src/services/usage-counters.js';
import { parseChunk } from '../apps/control/src/services/usage-parse.js';

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? (process.argv[at + 1] ?? fallback) : fallback;
};
const CLAUDE = arg('claude', join(homedir(), '.claude', 'projects'));
const CODEX = arg('codex', join(homedir(), '.codex', 'sessions'));
const CODEX_FILES = Number(arg('codex-files', '300'));
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MINUTE = 60_000;

type Minutes = Map<number, { tokens: number; tools: number }>;

/** Per-minute fresh tokens and tool calls of one transcript, from the app's own parser. */
function minutesOf(file: string, provider: 'claude' | 'codex'): Minutes {
  const state = newState(provider);
  const fd = openSync(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(8 * 1024 * 1024);
    let carry = Buffer.alloc(0);
    for (let offset = 0; ;) {
      const read = readSync(fd, chunk, 0, chunk.length, offset);
      if (!read) break;
      offset += read;
      const data = Buffer.concat([carry, chunk.subarray(0, read)]);
      const end = data.lastIndexOf(10);
      if (end < 0) {
        carry = data;
        continue;
      }
      parseChunk(state, data.subarray(0, end), (ms) => String(Math.floor(ms / MINUTE)));
      carry = Buffer.from(data.subarray(end + 1));
    }
  } finally {
    closeSync(fd);
  }
  return new Map(
    Object.entries(state.days).map(([minute, b]) => [
      Number(minute),
      { tokens: fresh(b), tools: b.tools },
    ]),
  );
}

function* walk(dir: string, match: (path: string) => boolean): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path, match);
    else if (entry.isFile() && match(path)) yield path;
  }
}

const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    activeMinutes: sorted.length,
    p25: Math.round(percentile(sorted, 0.25)),
    p50: Math.round(percentile(sorted, 0.5)),
    p75: Math.round(percentile(sorted, 0.75)),
    p90: Math.round(percentile(sorted, 0.9)),
    p95: Math.round(percentile(sorted, 0.95)),
    p99: Math.round(percentile(sorted, 0.99)),
  };
}
const active = (minutes: Iterable<{ tokens: number; tools: number }>) =>
  [...minutes].filter((m) => m.tokens > 0 || m.tools > 0);

// Claude subagents, per file and summed per parent session (the squad).
const squads = new Map<string, Minutes>();
const perAgent: { tokens: number[]; tools: number[] } = { tokens: [], tools: [] };
let agentFiles = 0;
// Files over the size cap are left out, so the distribution leans to small sessions: how many are left out is printed.
let skippedClaude = 0;
for (const file of walk(CLAUDE, (p) => /\/subagents\/agent-[^/]*\.jsonl$/.test(p))) {
  if (statSync(file).size > MAX_FILE_BYTES) {
    skippedClaude += 1;
    continue;
  }
  agentFiles += 1;
  const minutes = minutesOf(file, 'claude');
  for (const m of active(minutes.values())) {
    perAgent.tokens.push(m.tokens);
    perAgent.tools.push(m.tools);
  }
  const key = file.replace(/\/agent-[^/]*$/, '');
  const squad = squads.get(key) ?? new Map();
  for (const [minute, m] of minutes) {
    const sum = squad.get(minute) ?? { tokens: 0, tools: 0 };
    squad.set(minute, { tokens: sum.tokens + m.tokens, tools: sum.tools + m.tools });
  }
  squads.set(key, squad);
}
const squadMinutes = [...squads.values()].flatMap((s) => active(s.values()));

// Codex rollouts: the newest ones that fit the budget (their tool calls are the beam's rate for Codex squads).
const allRollouts = [...walk(CODEX, (p) => /rollout-[^/]*\.jsonl$/.test(p))].sort();
const fitting = allRollouts.filter((p) => statSync(p).size <= MAX_FILE_BYTES);
const rollouts = fitting.slice(-CODEX_FILES);
const codexMinutes = rollouts.flatMap((f) => active(minutesOf(f, 'codex').values()));

console.log(
  JSON.stringify(
    {
      claudeSubagentFiles: agentFiles,
      claudeSquads: squads.size,
      codexRollouts: rollouts.length,
      skipped: {
        claudeOverSizeCap: skippedClaude,
        codexOverSizeCap: allRollouts.length - fitting.length,
        codexOlderThanNewest: fitting.length - rollouts.length,
      },
      tokensPerMinute: {
        subagent: summary(perAgent.tokens.filter((n) => n > 0)),
        squad: summary(squadMinutes.map((m) => m.tokens).filter((n) => n > 0)),
        codexSession: summary(codexMinutes.map((m) => m.tokens).filter((n) => n > 0)),
      },
      toolCallsPerMinute: {
        subagent: summary(perAgent.tools.filter((n) => n > 0)),
        squad: summary(squadMinutes.map((m) => m.tools).filter((n) => n > 0)),
        codexSession: summary(codexMinutes.map((m) => m.tools).filter((n) => n > 0)),
      },
    },
    null,
    2,
  ),
);
