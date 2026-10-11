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
  source: z.enum(['hook', 'transcript', 'rollout']).default('hook'),
  status: z.enum(['running', 'waiting_permission', 'finished', 'unknown']).default('unknown'),
  startedAt: z.number().nullable().default(null),
  endedAt: z.number().nullable().default(null),
  // Codex names its helpers; a short label, never free text from a prompt.
  nickname: z.string().max(40).nullable().default(null),
  tools: z
    .object({
      count: z.number().int().nonnegative(),
      last: z.string().nullable(),
      lastAt: z.number().nullable(),
    })
    .nullable()
    .default(null),
  label: z.string().max(60).nullable().default(null),
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
  title: z.string().nullable(),
  // Which engineering role the session's work belongs to, how sure that is (0 to 1) and why: short redacted `kind:
  // detail` strings, never the text they came from. Decided on the server; no clear signal means a generalist.
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
    // (`model`), Claude's 200k default (`assumed`) or 1M because the context passed 200k (`inferred`). Null while
    // unknown.
    contextWindowBasis: z
      .enum(['observed', 'catalog', 'model', 'assumed', 'inferred'])
      .nullable()
      .optional(),
    // Share of the window in use, 0 to 100, bounded; null while either side is unknown, never invented.
    contextPct: z.number().min(0).max(100).nullable(),
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
  process: z.enum(['running', 'none', 'unknown']),
  resources: z.object({ cpuPercent: z.number(), rssBytes: z.number() }).nullable(),
  liveness: z.object({
    state: z.enum(['active', 'idle', 'dormant', 'orphaned', 'ended', 'unknown']),
    startedAt: z.number().nullable(),
    quietMs: z.number().nullable(),
    zombies: z.array(
      z.object({ pid: z.number().int(), startedAt: z.number(), program: z.string().nullable() }),
    ),
  }),
  ports: z.array(z.number().int()),
});
export type LocalSession = z.infer<typeof localSessionSchema>;
export type AttributedSession = LocalSession & { projectId: string | null };
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

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_OUT_MIN_IDLE_MS = DAY_MS;
export { CLOCK_OUT_MAX_SESSIONS };
export const clockOutRequestSchema = z.strictObject({
  sessions: z
    .array(
      z.strictObject({
        key: z.string().regex(/^(claude|codex):[A-Za-z0-9._-]{1,200}$/),
        startedAt: z.number().int(),
      }),
    )
    .min(1)
    .max(CLOCK_OUT_MAX_SESSIONS),
  minIdleMs: z
    .number()
    .int()
    .min(CLOCK_OUT_MIN_IDLE_MS)
    .max(365 * DAY_MS),
});
export type ClockOutRequest = z.infer<typeof clockOutRequestSchema>;
export type ClockOutSkipReason =
  | 'not_found'
  | 'no_project'
  | 'forbidden'
  | 'not_running'
  | 'active'
  | 'changed'
  | 'zombie'
  | 'own_ancestor';
export type ClockOutItem =
  | { key: string; outcome: 'cleared'; freedBytes: number | null }
  | { key: string; outcome: 'skipped'; reason: ClockOutSkipReason }
  | { key: string; outcome: 'failed'; reason: 'still_running' };
export type ClockOutResponse = { results: ClockOutItem[] };
