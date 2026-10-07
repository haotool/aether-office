import { SESSION_ACTIVE_MS, type Subagent } from '@aether/contracts';
import { withEdge } from './file-edge.js';
import { FINISHED_GRACE_MS } from './hook-spool.js';
import { linesWithFromEnd } from './session-usage.js';
import {
  listSubagentFiles,
  readSubagentMeta,
  resetSubagentMetas,
  type SubagentFile,
} from './subagent-files.js';
import { plainSummary } from './subagent-text.js';
import {
  readSubagentUsage,
  resetSubagentUsage,
  type ReadBudget,
  type SubagentUsage,
} from './subagent-usage.js';
import type { Outcomes } from './tool-outcomes.js';

/**
 * Claude subagents known from their own transcript files (`<session>/subagents/agent-<id>.jsonl`), so they are visible
 * without hooks and, with hooks, gain what hooks cannot say: label, token usage and the last words. A file quiet for
 * SESSION_ACTIVE_MS is taken as finished (the same rule as a Codex child rollout) and stays for the grace period. Tail reads are
 * bounded and cached by mtime and size; every text goes through `plainSummary` (redaction before any cut).
 */
const TAIL_BYTES = 128 * 1024;
const MAX_TEXT_LINE_BYTES = 200 * 1024;
const SUMMARY_CHARS = 160;
const MAX_TAILS = 256;
const TOOL_USE = /"type":"tool_use","id":"[^"]*","name":"([\w.:-]{1,80})"/;
const STAMP = /"timestamp":"([^"]{20,30})"/;

type Tail = { text: string | null; tool: { name: string; at: number | null } | null };
const tails = new Map<string, { mtime: number; size: number; tail: Tail }>();
export const resetSubagentTranscripts = () => {
  tails.clear();
  resetSubagentMetas();
  resetSubagentUsage();
};

const at = (stamp: string | undefined) => {
  const t = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Pure. The last assistant text and the last tool call in a transcript tail. */
export function parseTail(data: Buffer): Tail {
  let text: string | null = null;
  for (const line of linesWithFromEnd(data, ['"type":"text"'])) {
    if (line.length > MAX_TEXT_LINE_BYTES) continue;
    try {
      const entry = JSON.parse(line) as { type?: string; message?: { content?: unknown } };
      const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
      const said = blocks
        .flatMap((b: { type?: string; text?: unknown }) =>
          b.type === 'text' && typeof b.text === 'string' ? [b.text] : [],
        )
        .join('\n')
        .trim();
      if (entry.type === 'assistant' && said) {
        text = said;
        break;
      }
    } catch {
      /* the first line of a tail read is usually cut in half */
    }
  }
  let tool: Tail['tool'] = null;
  for (const line of linesWithFromEnd(data, ['"type":"tool_use"'])) {
    const name = TOOL_USE.exec(line)?.[1];
    if (name) {
      tool = { name, at: at(STAMP.exec(line)?.[1]) };
      break;
    }
  }
  return { text, tool };
}

async function readTail(f: SubagentFile): Promise<Tail> {
  const hit = tails.get(f.file);
  if (hit && hit.mtime === f.mtime && hit.size === f.size) return hit.tail;
  const tail = await withEdge(f.file, 'tail', TAIL_BYTES, parseTail).catch((): Tail => ({
    text: null,
    tool: null,
  }));
  if (tails.size >= MAX_TAILS) tails.delete(tails.keys().next().value!);
  tails.set(f.file, { mtime: f.mtime, size: f.size, tail });
  return tail;
}

export type SubagentContext = {
  /** The parent transcript's tool outcomes (read on demand), for the `error` flag of a result. */
  outcomes: () => Promise<Outcomes>;
  /** Ids a hook already reported as stopped: their result is shown at once, not after the quiet period. */
  finished: ReadonlySet<string>;
  budget: ReadBudget;
};

function resultOf(
  text: string | null,
  error: boolean | null,
): NonNullable<Subagent['result']> | null {
  if (text) return { summary: plainSummary(text, SUMMARY_CHARS), error, chars: text.length };
  return error === true ? { summary: '', error, chars: 0 } : null;
}

async function describe(f: SubagentFile, now: number, ctx: SubagentContext): Promise<Subagent> {
  const [meta, usage, tail] = await Promise.all([
    readSubagentMeta(f.file),
    readSubagentUsage(f.file, f.size, now, ctx.budget),
    readTail(f),
  ]);
  const finished = now - f.mtime >= SESSION_ACTIVE_MS || ctx.finished.has(f.id);
  // The parent's own result for the call that spawned it: a failure is a failure, a success only counts for a call the
  // parent waited for (a background launch "succeeds" at once, whatever the subagent goes on to do).
  const outcome =
    finished && meta.toolUseId ? (await ctx.outcomes()).get(meta.toolUseId) : undefined;
  const error = outcome === false ? true : outcome === true && meta.foreground ? false : null;
  return {
    id: f.id,
    type: meta.type,
    lastSeen: Math.round(f.mtime),
    source: 'transcript',
    status: finished ? 'finished' : 'running',
    startedAt: f.startedAt,
    endedAt: finished ? Math.round(f.mtime) : null,
    nickname: null,
    tools: usage ? toolsOf(usage, tail) : null,
    label: meta.label,
    tokens: usage ? { total: usage.total, perMinute: usage.perMinute, sampledAt: now } : null,
    result: finished ? resultOf(tail.text, error) : null,
  };
}

const toolsOf = (usage: SubagentUsage, tail: Tail): NonNullable<Subagent['tools']> => ({
  count: usage.tools,
  last: tail.tool?.name ?? null,
  lastAt: tail.tool?.at ?? null,
});

/** The subagents of a Claude session as its own files show them (live ones and those finished within the grace period). */
export async function readSubagentTranscripts(
  sessionFile: string,
  now: number,
  ctx: SubagentContext,
): Promise<Subagent[]> {
  const files = await listSubagentFiles(sessionFile, now, SESSION_ACTIVE_MS + FINISHED_GRACE_MS);
  const out: Subagent[] = [];
  for (const f of files) out.push(await describe(f, now, ctx));
  return out;
}

/**
 * Joins what each source knows. A hook child keeps its own lifecycle (it saw the stop and the permission waits); the file
 * adds label, tokens and the last words (once it is finished). A file with no hook child, and a rollout child, stand alone.
 */
export function mergeSubagents(
  hooked: readonly Subagent[],
  files: readonly Subagent[],
  rollouts: readonly Subagent[],
): Subagent[] {
  const byId = new Map(files.map((f) => [f.id, f]));
  const merged = hooked.map((h): Subagent => {
    const f = byId.get(h.id);
    byId.delete(h.id);
    return f
      ? {
          ...h,
          startedAt: h.startedAt ?? f.startedAt,
          tools: h.tools ?? f.tools,
          label: f.label,
          tokens: f.tokens,
          result: h.status === 'finished' ? f.result : null,
        }
      : h;
  });
  return [...merged, ...byId.values(), ...rollouts];
}
