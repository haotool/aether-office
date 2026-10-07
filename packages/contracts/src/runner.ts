import { z } from 'zod';
import { id, shortText } from './shared.js';
import {
  type Delivery,
  type Message,
  type Mode,
  type Provider,
  activitySchema,
  terminalDimensions,
} from './core.js';
import { providerEventSchema } from './events.js';

export const reviewResultSchema = z
  .object({
    decision: z.enum(['approve', 'changes_requested']),
    body: z.string().trim().min(1).max(8000),
    headSha: z.string().regex(/^[0-9a-f]{40,64}$/),
  })
  .strict();
export const runnerEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('started'),
      sourceEventId: id,
      runId: id,
      epoch: z.number().int().positive(),
      providerSessionId: z.string().max(200),
      processIdentity: z.string().max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal('activity'),
      sourceEventId: id,
      runId: id,
      epoch: z.number().int().positive(),
      activity: activitySchema,
      summary: z.string().max(4000),
    })
    .strict(),
  z
    .object({
      type: z.literal('workspace'),
      sourceEventId: id,
      runId: id,
      epoch: z.number().int().positive(),
      workspace: z
        .object({
          id,
          projectId: id,
          workId: id,
          attempt: z.number().int().positive(),
          repository: z.string().max(4096),
          path: z.string().max(4096),
          branch: z.string().max(300),
          baseSha: z.string().regex(/^[0-9a-f]{40,64}$/),
          createdAt: z.number().int(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('provider'),
      sourceEventId: id,
      runId: id,
      epoch: z.number().int().positive(),
      event: providerEventSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('result'),
      sourceEventId: id,
      runId: id,
      epoch: z.number().int().positive(),
      outcome: z.enum(['submitted', 'failed', 'cancelled', 'indeterminate']),
      summary: z.string().max(32000),
      review: reviewResultSchema.optional(),
      headSha: z
        .string()
        .regex(/^[0-9a-f]{40,64}$/)
        .optional(),
    })
    .strict(),
]);
export type RunnerEvent = z.infer<typeof runnerEventSchema>;
export type RunCommand = {
  purpose?: 'implementation' | 'review';
  reviewHead?: string;
  reviewBase?: string;
  id: string;
  runId: string;
  sessionId: string;
  maxTurns: number;
  attempt: number;
  epoch: number;
  projectId: string;
  agentId: string;
  workId: string;
  provider: Provider;
  prompt: string;
  mode: Mode;
  root: string | null;
  timeoutMs: number;
  workspaceId?: string;
  resumeSessionId?: string;
};
export const inboxQuerySchema = z.object({
  recipientId: id,
  filter: z.enum(['pending', 'history']).default('pending'),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type InboxPage = {
  schemaVersion: 1;
  messages: (Message & { delivery: Delivery })[];
  nextCursor: string | null;
  hasMore: boolean;
  highWatermark: string;
};

export const verifierSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const runnerJobSchema = z
  .object({
    id,
    projectId: id,
    workId: id,
    workspaceId: id,
    kind: z.enum(['diff', 'verify', 'integrate']),
    expectedHead: z.string().regex(/^[a-f0-9]{40,64}$/),
    payload: z
      .object({
        verifier: verifierSchema.optional(),
        integrate: z
          .object({
            baseBranch: z.string(),
            expectedBase: z.string().regex(/^[0-9a-f]{40}$/),
            candidate: z.string(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
export type RunnerJob = z.infer<typeof runnerJobSchema>;
const gitStateSchema = z
  .object({
    head: z.string().regex(/^[a-f0-9]{40,64}$/),
    tree: z.string().regex(/^[a-f0-9]{40,64}$/),
    indexTree: z.string().regex(/^[a-f0-9]{40,64}$/),
    status: z.string().max(16000),
  })
  .strict();
const verificationSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    workspaceId: id,
    status: z.enum(['passed', 'failed', 'invalidated', 'cancelled']),
    before: gitStateSchema,
    after: gitStateSchema,
    baseBefore: z.string().regex(/^[a-f0-9]{40,64}$/),
    baseAfter: z.string().regex(/^[a-f0-9]{40,64}$/),
    harnessHash: z.string().regex(/^[a-f0-9]{64}$/),
    harnessSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    exitCode: z.number().int().nullable(),
    startedAt: z.number(),
    finishedAt: z.number(),
    logHash: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().max(4000).nullable(),
  })
  .strict();
const integrationResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('merged'),
      baseSha: z.string(),
      headSha: z.string(),
      mergeSha: z.string(),
      candidate: z.string(),
    })
    .strict(),
  z.object({ status: z.literal('up_to_date'), baseSha: z.string(), headSha: z.string() }).strict(),
  z
    .object({
      status: z.literal('conflict'),
      baseSha: z.string(),
      headSha: z.string(),
      files: z.array(z.string().max(4096)).max(500),
    })
    .strict(),
  z.object({ status: z.literal('base_moved'), expected: z.string(), actual: z.string() }).strict(),
]);
export type IntegrationResult = z.infer<typeof integrationResultSchema>;
export const jobReportSchema = z
  .object({
    jobId: id,
    status: z.enum(['succeeded', 'failed']),
    error: z.string().max(200).optional(),
    verification: verificationSchema.optional(),
    integration: integrationResultSchema.optional(),
    diff: z
      .object({
        baseSha: z.string().regex(/^[a-f0-9]{40,64}$/),
        headSha: z.string().regex(/^[a-f0-9]{40,64}$/),
        text: z.string().max(60000),
        untracked: z.array(z.string().max(4096)).max(1000),
        truncated: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const terminalProfileSchema = z
  .object({ name: shortText, hash: z.string().regex(/^[a-f0-9]{64}$/), root: z.string().max(4096) })
  .strict();
export const terminalDispatchSchema = z
  .object({
    id,
    terminalId: id,
    projectId: id,
    kind: z.enum(['start', 'input', 'resize', 'stop']),
    profile: shortText,
    profileHash: z.string().regex(/^[a-f0-9]{64}$/),
    root: z.string(),
    payload: z.record(z.string(), z.unknown()),
    identityId: id,
    controlEpoch: z.number().int().nonnegative(),
  })
  .strict();
export type TerminalDispatch = z.infer<typeof terminalDispatchSchema>;
export const terminalSnapshotSchema = z
  .object({
    terminalId: id,
    state: z.enum(['running', 'exited', 'indeterminate', 'stopping']),
    processIdentity: z.string().max(200),
    cursor: z.number().int().nonnegative(),
    gap: z.boolean(),
    chunks: z
      .array(z.object({ seq: z.number().int().positive(), data: z.string().max(60000) }).strict())
      .max(2048),
    exit: z.object({ exitCode: z.number().int(), signal: z.number().int().nullable() }).nullable(),
    dimensions: z.object(terminalDimensions).strict(),
  })
  .strict()
  .refine(
    (s) => new TextEncoder().encode(JSON.stringify(s.chunks)).length <= 90000,
    'TERMINAL_OUTPUT_LIMIT',
  );

export type TerminalSnapshot = z.infer<typeof terminalSnapshotSchema>;

export const observationReportSchema = z
  .object({
    reportId: id,
    projectId: id,
    agentId: id,
    projectRoot: z.string().min(1).max(4096),
    sourceKey: z.string().regex(/^[a-f0-9]{64}$/),
    provider: z.enum(['codex', 'claude']),
    label: shortText,
    revision: z.number().int().positive(),
    status: z.enum([
      'observed',
      'unchanged',
      'partial',
      'missing',
      'blocked_path',
      'unsupported_schema',
      'limit_exceeded',
      'read_error',
    ]),
    records: z
      .array(
        z
          .object({
            sourceId: z.string().regex(/^[a-f0-9]{64}$/),
            sessionId: z.string().min(1).max(200),
            kind: z.enum(['message', 'tool']),
            role: z.enum(['user', 'assistant']),
            text: z.string().max(16000),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();
export type ObservationReport = z.infer<typeof observationReportSchema>;
