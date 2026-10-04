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
