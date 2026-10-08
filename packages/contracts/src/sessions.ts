import { z } from 'zod';
import { CLOCK_OUT_MAX_SESSIONS } from './session-limits.js';

// The closed vocabulary of command labels (packages/providers/src/command-tags.mjs): what kind of command a tool call was,
// never its arguments. A test keeps this list and the classifier's the same.
export const commandTagSchema = z.enum([
  'test',
  'build',
  'typecheck',
  'lint',
  'install',
  'docker',
  'deploy',
  'publish',
  'release',
  'ci.watch',
  'git.commit',
  'git.push',
  'git.push.force',
  'git.merge',
  'git.rebase',
  'git.reset.hard',
  'git.conflict.marker',
  'gh.pr.approve',
  'fs.rm.recursive',
  'sudo',
  'curl.pipe',
  'editor.vim',
  'search.todo',
]);
export type CommandTag = z.infer<typeof commandTagSchema>;

// One helper agent of a session. Every field after `lastSeen` is defaulted so a payload from an older control plane
// still parses: `unknown` and null mean "not known", never a guess.
export const subagentSchema = z.object({
  id: z.string(),
  type: z.string(),
  lastSeen: z.number(),
  // Where the facts come from: a hook record, a transcript file, or a Codex rollout.
  source: z.enum(['hook', 'transcript', 'rollout']).default('hook'),
  status: z.enum(['running', 'waiting_permission', 'finished', 'unknown']).default('unknown'),
  startedAt: z.number().nullable().default(null),
  endedAt: z.number().nullable().default(null),
  // Codex names its helpers; a short label, never free text from a prompt.
  nickname: z.string().max(40).nullable().default(null),
  // Tool calls the subagent made (hook records only), with the last tool's name.
  tools: z
    .object({
      count: z.number().int().nonnegative(),
      last: z.string().nullable(),
      lastAt: z.number().nullable(),
    })
    .nullable()
    .default(null),
  // What the parent asked it to do, in a few words: the Task description, run through the text pipeline. Null when unknown.
  label: z.string().max(60).nullable().default(null),
  // What it spent (transcript files only): new input, cache writes and output tokens, and the rate over the last minute
  // measured between scans (0 until two samples exist).
  tokens: z
    .object({
      total: z.number().int().nonnegative(),
      perMinute: z.number().nonnegative(),
      sampledAt: z.number(),
    })
    .nullable()
    .default(null),
  // Its last words, as plain text cut to 160 characters (redacted first). `error` is true or false only when the parent's
  // own tool result for the call says so; null when that is not known.
  result: z
    .object({
      summary: z.string().max(160),
      error: z.boolean().nullable(),
      chars: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
});
export type Subagent = z.infer<typeof subagentSchema>;

export { SESSION_ACTIVE_MS, SESSION_GONE_MS } from './session-limits.js';

export const localSessionSchema = z.object({
  key: z.string(),
  provider: z.enum(['claude', 'codex']),
  sessionId: z.string(),
  cwd: z.string(),
  repo: z.string(),
  mtime: z.number(),
  git: z
    .object({
      branch: z.string().nullable(),
      upstream: z.string().nullable(),
      ahead: z.number(),
      behind: z.number(),
      uncommitted: z.number(),
      // Files in a conflicted state (git's unmerged codes in `status`), counted from the same read; 0 on an older server.
      conflicts: z.number().int().nonnegative().default(0),
    })
    .nullable(),
  // Canonical identity: sessions share a project when they share the Git common directory.
  worktree: z
    .object({ root: z.string(), main: z.string(), project: z.string(), linked: z.boolean() })
    .nullable(),
  // Present only when the user installed hooks; otherwise activity is a file-mtime heuristic.
  hook: z
    .object({
      activity: z.enum(['working', 'idle', 'waiting_permission', 'ended']),
      lastEvent: z.string(),
      tool: z.string().nullable(),
      at: z.number(),
      // The last few tool calls, oldest first, with a short redacted target (a file's base name, a command's first
      // word); never a full command, arguments or content.
      recent: z.array(
        z.object({
          tool: z.string(),
          target: z.string().nullable(),
          at: z.number(),
          // The subagent that made the call (Claude's agent_id); null for the session's own calls.
          agentId: z.string().nullable().default(null),
          // What kind of command it was, from a closed vocabulary; never arguments, paths or patterns.
          tags: z.array(commandTagSchema).max(4).default([]),
          // How it ended: true or false only when the provider said so, null while unknown (never guessed).
          ok: z.boolean().nullable().default(null),
        }),
      ),
    })
    .nullable(),
  subagents: z.array(subagentSchema),
  // The title the provider itself gave the session (Claude ai-title, Codex thread_name); null when it has none.
  title: z.string().nullable(),
  // Which engineering role the session's work belongs to, how sure that is (0 to 1) and why: the strongest reasons as
  // short redacted `kind: detail` strings (a matched keyword, a kind of file or command), never the text they came from.
  // Decided on the server; a session with no clear signal is a generalist.
  classification: z.object({
    role: z.string(),
    department: z.string(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().max(80)).max(5),
  }),
  // Model and context size from the transcript tail; null when it cannot be read, never zero.
  usage: z.object({
    model: z.string().nullable(),
    contextTokens: z.number().nullable(),
    // The window the context is measured against: Codex's own figure, else the catalog's, else Claude's 200k (1M for a
    // `[1m]` model or a context already past 200k). Null while unknown.
    contextWindow: z.number().nullable(),
    // How the window is known: the CLI's own figure (`observed`), a model catalog (`catalog`), a `[1m]` model id
    // (`model`), Claude's 200k default (`assumed`: the transcript does not say), or 1M because the context already passed
    // 200k (`inferred`). Null while the window is unknown; absent from an older control plane.
    contextWindowBasis: z
      .enum(['observed', 'catalog', 'model', 'assumed', 'inferred'])
      .nullable()
      .optional(),
    // Share of the window in use, 0 to 100, bounded; null while either side is unknown, never invented.
    contextPct: z.number().min(0).max(100).nullable(),
    // When the CLI itself last wrote a compaction marker in the transcript tail (epoch ms); null when it has not.
    compactedAt: z.number().nullable(),
    // Tokens the session processed that the prompt cache did not already hold (cache reads are left out: the same
    // context is read again every turn, so counting it would make a long session look a hundred times bigger).
    freshTokens: z.number().nullable(),
    // The provider's own subscription window, when it records one (Codex does; Claude Code does not, locally).
    limit: z
      .object({
        usedPercent: z.number(),
        windowMinutes: z.number().nullable(),
        resetsAt: z.number().nullable(),
        plan: z.string().nullable(),
      })
      .nullable(),
  }),
  // Is an agent CLI process running for it? 'unknown' for Codex Desktop threads, which share one app server.
  process: z.enum(['running', 'none', 'unknown']),
  // CPU (share of one core) and resident memory of the process behind it, when one was found.
  resources: z.object({ cpuPercent: z.number(), rssBytes: z.number() }).nullable(),
  // How alive it is: working, waiting, long forgotten, or left without an owner; and when its process began
  // (with the session, the identity a stop request must name) and how long nothing has happened in it.
  liveness: z.object({
    state: z.enum(['active', 'idle', 'dormant', 'orphaned', 'ended', 'unknown']),
    startedAt: z.number().nullable(),
    quietMs: z.number().nullable(),
    // Finished processes under its process that nobody has collected: zombies, shown standing behind its seat.
    zombies: z.array(
      z.object({ pid: z.number().int(), startedAt: z.number(), program: z.string().nullable() }),
    ),
  }),
  // Ports its process tree listens on: a dev server it started, for a preview link.
  ports: z.array(z.number().int()),
});
export type LocalSession = z.infer<typeof localSessionSchema>;
// A session joined to the AETHER project whose root is its main checkout; null until that project exists.
export type AttributedSession = LocalSession & { projectId: string | null };
// A custom slash command or skill found for a session: what follows the slash (`team:review`), a one-line redacted
// description, where it was found and what it is. Names and descriptions only, never the file.
export type CustomCommand = {
  name: string;
  description: string;
  source: 'project' | 'user';
  kind: 'command' | 'skill';
};
export type LocalSessionsResponse = { enabled: boolean; sessions: AttributedSession[] };

// Claude's subscription windows, from the numbers a status line already fetched (see services/claude-limits.ts). A
// window that is absent, or whose reset has passed, is null: never a guess.
type LimitWindow = { usedPercent: number; resetsAt: number | null };
export type ClaudeLimits = {
  plan: string | null;
  fiveHour: LimitWindow | null;
  sevenDay: LimitWindow | null;
  /** When the numbers were fetched, and whether that is too long ago to still call current. */
  updatedAt: number;
  stale: boolean;
};
export type ClaudeLimitsResponse = { limits: ClaudeLimits | null };

// The models each provider's CLI offers on this machine (packages/providers/src/models.ts), read from the CLIs' own
// caches and never written. The readers skip anything they do not recognise, so these hold only what was understood.
export type ModelEntry = {
  id: string;
  label: string;
  family?: string;
  efforts: string[];
  defaultEffort?: string;
  isAlias: boolean;
  contextWindow?: number;
};
export type ModelCatalog = {
  provider: 'claude' | 'codex';
  models: ModelEntry[];
  source: 'cache' | 'cli' | 'fallback';
  fetchedAt?: number;
  stale: boolean;
};
export type ModelsResponse = { catalogs: ModelCatalog[] };

// "Clock out": send the sessions that have sat idle for a day or more home in one request. The client names sessions by
// the key the scanner gave them and the process start time it saw (never a pid); the server decides for each one.
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_OUT_MIN_IDLE_MS = DAY_MS;
export { CLOCK_OUT_MAX_SESSIONS };
export const clockOutRequestSchema = z
  .object({
    sessions: z
      .array(
        z
          .object({
            key: z.string().regex(/^(claude|codex):[A-Za-z0-9._-]{1,200}$/),
            startedAt: z.number().int(),
          })
          .strict(),
      )
      .min(1)
      .max(CLOCK_OUT_MAX_SESSIONS),
    // Idle at least this long, checked again on the server against the session's own clock.
    minIdleMs: z
      .number()
      .int()
      .min(CLOCK_OUT_MIN_IDLE_MS)
      .max(365 * DAY_MS),
  })
  .strict();
export type ClockOutRequest = z.infer<typeof clockOutRequestSchema>;
export type ClockOutSkipReason =
  | 'not_found' // the scanner no longer knows it
  | 'no_project'
  | 'forbidden'
  | 'not_running'
  | 'active' // not idle long enough any more (or not idle at all): someone is working in it again
  | 'changed' // not the process the person saw
  | 'zombie'
  | 'own_ancestor';
export type ClockOutItem =
  | { key: string; outcome: 'cleared'; freedBytes: number | null }
  | { key: string; outcome: 'skipped'; reason: ClockOutSkipReason }
  | { key: string; outcome: 'failed'; reason: 'still_running' };
export type ClockOutResponse = { results: ClockOutItem[] };
