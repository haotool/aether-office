import { z } from 'zod';

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
        z.object({ tool: z.string(), target: z.string().nullable(), at: z.number() }),
      ),
    })
    .nullable(),
  subagents: z.array(z.object({ id: z.string(), type: z.string(), lastSeen: z.number() })),
  // The title the provider itself gave the session (Claude ai-title, Codex thread_name); null when it has none.
  title: z.string().nullable(),
  // Which engineering role the session's work belongs to, and what that rests on. Decided on the server; the
  // text it was decided from is never sent.
  classification: z.object({
    role: z.string(),
    department: z.string(),
    basis: z.enum(['title', 'prompt', 'context', 'default']),
    matched: z.string().nullable(),
  }),
  // Model and context size from the transcript tail; null when it cannot be read, never zero.
  usage: z.object({
    model: z.string().nullable(),
    contextTokens: z.number().nullable(),
    contextWindow: z.number().nullable(),
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
const limitWindowSchema = z.object({ usedPercent: z.number(), resetsAt: z.number().nullable() });
export const claudeLimitsSchema = z.object({
  plan: z.string().nullable(),
  fiveHour: limitWindowSchema.nullable(),
  sevenDay: limitWindowSchema.nullable(),
  // When the numbers were fetched, and whether that is too long ago to still call current.
  updatedAt: z.number(),
  stale: z.boolean(),
});
export type ClaudeLimits = z.infer<typeof claudeLimitsSchema>;
export type ClaudeLimitsResponse = { limits: ClaudeLimits | null };

// The models each provider's CLI offers on this machine (packages/providers/src/models.ts), read from the CLIs' own
// caches and never written. The readers skip anything they do not recognise, so these hold only what was understood.
export const modelEntrySchema = z.object({
  id: z.string().max(120),
  label: z.string().max(80),
  family: z.string().max(40).optional(),
  efforts: z.array(z.string().max(20)).max(12),
  defaultEffort: z.string().max(20).optional(),
  isAlias: z.boolean(),
  contextWindow: z.number().int().positive().optional(),
});
export const modelCatalogSchema = z.object({
  provider: z.enum(['claude', 'codex']),
  models: z.array(modelEntrySchema).max(100),
  source: z.enum(['cache', 'cli', 'fallback']),
  fetchedAt: z.number().optional(),
  stale: z.boolean(),
});
export type ModelEntry = z.infer<typeof modelEntrySchema>;
export type ModelCatalog = z.infer<typeof modelCatalogSchema>;
export type ModelsResponse = { catalogs: ModelCatalog[] };

// "Clock out": send the sessions that have sat idle for a day or more home in one request. The client names sessions by
// the key the scanner gave them and the process start time it saw (never a pid); the server decides for each one.
const DAY_MS = 24 * 60 * 60 * 1000;
export const CLOCK_OUT_MIN_IDLE_MS = DAY_MS;
export const CLOCK_OUT_MAX_SESSIONS = 50;
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
