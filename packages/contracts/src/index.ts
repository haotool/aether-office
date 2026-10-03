import { z } from 'zod';
export const id = z.string().uuid();
export const shortText = z.string().trim().min(1).max(160);
export const modeSchema = z.enum(['demo', 'live', 'observe']);
export const providerSchema = z.enum(['demo', 'claude', 'codex', 'acp', 'observe']);
export const workStateSchema = z.enum([
  'backlog',
  'ready',
  'assigned',
  'running',
  'reviewing',
  'changes_requested',
  'verified',
  'completed',
  'blocked',
  'cancel_requested',
  'cancelled',
  'failed',
  'indeterminate',
]);
export const activitySchema = z.enum([
  'idle',
  'starting',
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
  'offline',
  'error',
  'unknown',
]);
export const speciesSchema = z.enum([
  'fox',
  'cat',
  'rabbit',
  'bear',
  'otter',
  'raccoon',
  'panda',
  'dog',
]);
export const projectSchema = z.object({
  id,
  name: shortText,
  root: z.string().nullable(),
  mode: modeSchema,
  version: z.number().int(),
  createdAt: z.number(),
});
export const agentSchema = z.object({
  id,
  projectId: id,
  name: shortText,
  role: shortText,
  provider: providerSchema,
  mode: modeSchema,
  species: speciesSchema,
  color: z.string(),
  activity: activitySchema,
  version: z.number().int(),
  createdAt: z.number(),
  lastSeen: z.number().nullable(),
});
export const workSchema = z.object({
  id,
  projectId: id,
  title: shortText,
  description: z.string(),
  acceptance: z.string(),
  state: workStateSchema,
  assignee: id.nullable(),
  version: z.number().int(),
  priority: z.number().int(),
  createdAt: z.number(),
  updatedAt: z.number(),
  attempt: z.number().int(),
  maxAttempts: z.number().int().min(3).max(100),
  cancelCause: id.nullable(),
  result: z.string().nullable(),
  submittedBy: z.string().nullable(),
  headSha: z.string().nullable(),
  reviewBy: z.string().nullable(),
  verifiedSha: z.string().nullable(),
});
export const messageSchema = z.object({
  id,
  projectId: id,
  threadId: id,
  replyTo: id.nullable(),
  senderId: z.string(),
  body: z.string(),
  kind: z.enum(['inform', 'request', 'decision', 'handoff']),
  createdAt: z.number(),
  expiresAt: z.number(),
  roomId: id.nullable().default(null),
});
export const messageWaitSchema = z.object({
  messageId: id,
  recipientId: id,
  projectId: id,
  workId: id.nullable(),
  runId: id.nullable(),
  state: z.enum(['pending', 'responded', 'expired', 'cancelled']),
  deadline: z.number().int(),
  replyId: id.nullable(),
  endedAt: z.number().int().nullable(),
});
export type MessageWait = z.infer<typeof messageWaitSchema>;
export const deliveryStateSchema = z.enum([
  'available',
  'injected',
  'acknowledged',
  'responded',
  'failed',
  'expired',
  'cancelled',
]);
export const deliverySchema = z.object({
  sequence: z.string().regex(/^\d+$/),
  messageId: id,
  recipientId: id,
  state: deliveryStateSchema,
  acknowledgedAt: z.number().nullable(),
});
export const furnitureSchema = z
  .object({
    id: shortText,
    type: z.enum(['desk', 'plant', 'sofa', 'rack', 'table']),
    x: z.number().finite().min(-24).max(24),
    z: z.number().finite().min(-16).max(16),
    rotation: z.number().int().min(0).max(3),
    agentId: id.nullable().default(null),
  })
  .strict();
export const layoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    objects: z.array(furnitureSchema).max(180),
    zones: z.array(z.object({ id: shortText, name: shortText })).max(9),
  })
  .strict();
export type Layout = z.infer<typeof layoutSchema>;
const envelope = {
  schemaVersion: z.literal(1),
  idempotencyKey: z.string().min(8).max(100),
  correlationId: id,
};
const projectEnvelope = { ...envelope, projectId: id };
const version = z.number().int().nonnegative();
export const executionPolicySchema = z
  .object({
    liveEnabled: z.boolean(),
    maxTurns: z.number().int().min(1).max(20),
    timeoutMs: z.number().int().min(1000).max(600000),
  })
  .strict();
export const terminalDimensions = {
  cols: z.number().int().min(10).max(400),
  rows: z.number().int().min(2).max(200),
};
export const scheduleSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), at: z.number().int().positive() }).strict(),
  z
    .object({ kind: z.literal('daily'), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
    .strict(),
  z
    .object({
      kind: z.literal('weekly'),
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict(),
]);
export const scheduleTemplateSchema = z
  .object({
    title: shortText,
    description: z.string().max(16000).default(''),
    acceptance: z.string().trim().min(1).max(8000),
    priority: z.number().int().min(0).max(3).default(1),
  })
  .strict();
export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...projectEnvelope,
      type: z.literal('terminal.start'),
      data: z.object({ machineId: id, profile: shortText, ...terminalDimensions }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.enum(['terminal.takeover', 'terminal.release', 'terminal.stop']),
      data: z.object({ terminalId: id, epoch: z.number().int().nonnegative() }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('terminal.input'),
      data: z
        .object({
          terminalId: id,
          epoch: z.number().int().nonnegative(),
          text: z.string().min(1).max(8192),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('terminal.resize'),
      data: z
        .object({ terminalId: id, epoch: z.number().int().nonnegative(), ...terminalDimensions })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...envelope,
      type: z.literal('project.create'),
      data: z.object({ name: shortText, root: z.string().max(4096).optional() }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('project.execution.configure'),
      expectedVersion: version,
      data: executionPolicySchema,
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('agent.register'),
      data: z
        .object({
          name: shortText,
          role: shortText,
          provider: providerSchema,
          species: speciesSchema,
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.create'),
      data: z
        .object({
          title: shortText,
          description: z.string().max(16000),
          acceptance: z.string().trim().min(1).max(8000),
          dependencies: z.array(id).max(64).default([]),
          priority: z.number().int().min(0).max(3).default(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.dependencies'),
      expectedVersion: version,
      data: z.object({ workId: id, dependencies: z.array(id).max(64) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.assign'),
      expectedVersion: version,
      data: z.object({ workId: id, agentId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.submit'),
      expectedVersion: version,
      data: z
        .object({
          workId: id,
          result: z.string().min(1).max(32000),
          headSha: z
            .string()
            .regex(/^[0-9a-f]{40,64}$/)
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.request_review'),
      expectedVersion: version,
      data: z.object({ workId: id, agentId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.review'),
      expectedVersion: version,
      data: z
        .object({
          workId: id,
          decision: z.enum(['approve', 'changes_requested']),
          body: z.string().min(1).max(8000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.verify'),
      expectedVersion: version,
      data: z.object({ workId: id, verifier: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('workspace.diff'),
      expectedVersion: version,
      data: z.object({ workId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.accept'),
      expectedVersion: version,
      data: z.object({ workId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.extend'),
      expectedVersion: version,
      data: z.object({ workId: id, reason: z.string().trim().min(1).max(2000) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.retry'),
      expectedVersion: version,
      data: z.object({ workId: id, resume: z.boolean().default(false) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.cancel'),
      expectedVersion: version,
      data: z.object({ workId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('message.send'),
      data: z
        .object({
          // Either explicit recipients or a room, never both: a room's members are the recipients.
          recipients: z.array(id).max(32).default([]),
          roomId: id.optional(),
          body: z.string().trim().min(1).max(16000),
          kind: z.enum(['inform', 'request', 'decision', 'handoff']).default('inform'),
          threadId: id.optional(),
          replyTo: id.optional(),
          ttlMs: z.number().int().min(1000).max(604800000).default(86400000),
        })
        .strict()
        .refine((d) => (d.roomId ? d.recipients.length === 0 : d.recipients.length >= 1), {
          message: 'Provide recipients or a roomId, not both and not neither',
        }),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('message.ack'),
      data: z.object({ messageId: id, recipientId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('layout.save'),
      expectedVersion: version,
      data: layoutSchema,
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('approval.decide'),
      expectedVersion: version,
      data: z
        .object({
          approvalId: id,
          actionHash: z.string().regex(/^[a-f0-9]{64}$/),
          decision: z.enum(['approve', 'deny']),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('knowledge.approve'),
      expectedVersion: version,
      data: z
        .object({
          knowledgeId: id,
          decision: z.enum(['approve', 'reject']),
          reason: z.string().trim().min(1).max(2000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('knowledge.propose'),
      data: z
        .object({
          title: shortText,
          body: z.string().min(1).max(32000),
          source: z.string().trim().min(1).max(2048),
          workId: id.optional(),
          artifactId: id.optional(),
          commitSha: z
            .string()
            .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('room.create'),
      data: z.object({ name: shortText, members: z.array(id).min(1).max(32) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('room.members'),
      data: z.object({ roomId: id, members: z.array(id).min(1).max(32) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('a2a.client.create'),
      data: z
        .object({ name: shortText, maxOpen: z.number().int().min(1).max(100).default(10) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('a2a.client.revoke'),
      data: z.object({ clientId: id }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('machine.invite'),
      data: z
        .object({
          name: shortText,
          ttlSec: z.number().int().min(60).max(900).default(600),
          concurrency: z.number().int().min(1).max(4).default(1),
          providers: z
            .array(z.enum(['demo', 'claude', 'codex', 'acp']))
            .min(1)
            .max(4),
          roots: z.array(z.string().min(1).max(1024)).min(1).max(16),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('integration.connect'),
      data: z.discriminatedUnion('provider', [
        z
          .object({
            provider: z.literal('github'),
            owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/),
            repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
            tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
            webhookSecretEnv: z
              .string()
              .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
              .optional(),
            baseUrl: z.url().optional(),
          })
          .strict(),
        z
          .object({
            provider: z.literal('linear'),
            teamKey: z.string().regex(/^[A-Za-z0-9]{1,16}$/),
            tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
            baseUrl: z.url().optional(),
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('integration.toggle'),
      expectedVersion: version,
      data: z.object({ integrationId: id, enabled: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('skill.import'),
      data: z.object({ content: z.string().min(1).max(70000) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('skill.toggle'),
      expectedVersion: version,
      data: z.object({ skillId: id, enabled: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('schedule.create'),
      data: z
        .object({
          name: shortText,
          spec: scheduleSpecSchema,
          timezone: z.string().min(1).max(64).default('Asia/Taipei'),
          missed: z.enum(['skip', 'single']).default('skip'),
          template: scheduleTemplateSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('schedule.toggle'),
      expectedVersion: version,
      data: z.object({ scheduleId: id, enabled: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.integrate'),
      expectedVersion: version,
      data: z
        .object({
          workId: id,
          baseBranch: z.string().regex(/^[\w./-]{1,100}$/),
          expectedBase: z.string().regex(/^[0-9a-f]{40}$/),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('work.comment'),
      data: z
        .object({
          workId: id,
          headSha: z.string().regex(/^[0-9a-f]{40}$/),
          path: z.string().min(1).max(512),
          hunkHash: z.string().regex(/^[0-9a-f]{64}$/),
          line: z.number().int().positive().optional(),
          body: z.string().min(1).max(4000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('reservation.acquire'),
      data: z
        .object({
          patterns: z.array(z.string().min(1).max(256)).min(1).max(32),
          ttlSec: z.number().int().min(30).max(3600).default(600),
          workId: id.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('reservation.renew'),
      data: z
        .object({ reservationId: id, ttlSec: z.number().int().min(30).max(3600).default(600) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('reservation.release'),
      data: z.object({ reservationId: id }).strict(),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Work = z.infer<typeof workSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type Mode = z.infer<typeof modeSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Provider = z.infer<typeof providerSchema>;
export const eventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: id,
    seq: z.string().regex(/^\d+$/),
    projectId: id,
    type: z.string().regex(/^[a-z][a-z.]+$/),
    actorId: z.string(),
    occurredAt: z.number(),
    ingestedAt: z.number(),
    correlationId: id,
    causationId: z.string(),
    source: z.enum(['command', 'native', 'simulated', 'observed']),
    dataClassification: z.literal('project'),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type OfficeEvent = z.infer<typeof eventSchema>;
export type Snapshot = {
  schemaVersion: 1;
  seq: string;
  project: Project;
  agents: Agent[];
  work: Work[];
  dependencies: { workId: string; dependsOn: string }[];
  messages: (Message & { deliveries: Delivery[] })[];
  layout: { version: number; data: Layout } | null;
  runner: { id: string; name: string; lastSeen: number; state: string }[];
};
const bounded = z.string().max(200);
export const providerEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session.started'), providerSessionId: bounded }),
  z.object({ kind: z.literal('turn.started'), turnId: bounded }),
  z.object({
    kind: z.literal('assistant.message'),
    messageId: bounded,
    turnId: bounded,
    text: z.string().max(32000),
  }),
  z.object({
    kind: z.enum(['tool.requested', 'tool.started', 'tool.completed', 'tool.failed']),
    toolId: bounded,
    turnId: bounded,
    name: z.string().max(160),
    summary: z.string().max(4000),
    parentToolId: bounded.nullable(),
  }),
  z.object({
    kind: z.literal('usage'),
    turnId: bounded,
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.enum(['turn.completed', 'turn.failed']),
    turnId: bounded,
    summary: z.string().max(32000),
  }),
]);
export type ProviderEvent = z.infer<typeof providerEventSchema>;
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
export const verificationSchema = z
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
export const integrationResultSchema = z.discriminatedUnion('status', [
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
  worktree: z.object({ root: z.string(), project: z.string(), linked: z.boolean() }).nullable(),
  // Present only when the user installed hooks; otherwise activity is a file-mtime heuristic.
  hook: z
    .object({
      activity: z.enum(['working', 'idle', 'ended']),
      lastEvent: z.string(),
      at: z.number(),
    })
    .nullable(),
  subagents: z.array(z.object({ id: z.string(), type: z.string(), lastSeen: z.number() })),
});
export type LocalSession = z.infer<typeof localSessionSchema>;
export type LocalSessionsResponse = { enabled: boolean; sessions: LocalSession[] };

export const reservationSchema = z.object({
  id,
  ownerId: id,
  workId: id.nullable(),
  patterns: z.array(z.string()),
  fence: z.number().int(),
  state: z.enum(['active', 'expired', 'released']),
  expiresAt: z.number(),
  advisory: z.literal(true),
});
export type FileReservation = z.infer<typeof reservationSchema>;

export const reviewCommentSchema = z.object({
  id,
  workId: id,
  authorId: id,
  headSha: z.string(),
  path: z.string(),
  hunkHash: z.string(),
  line: z.number().nullable(),
  body: z.string(),
  createdAt: z.number(),
  status: z.enum(['current', 'carried', 'stale', 'unknown']),
});
export const reviewCommentsSchema = z.object({
  head: z.string().nullable(),
  hunks: z.array(z.object({ path: z.string(), header: z.string(), hash: z.string() })),
  comments: z.array(reviewCommentSchema),
});
export type ReviewComments = z.infer<typeof reviewCommentsSchema>;

export const scheduleSchema = z.object({
  id,
  name: z.string(),
  spec: scheduleSpecSchema,
  timezone: z.string(),
  missed: z.enum(['skip', 'single']),
  template: scheduleTemplateSchema,
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
  lastOccurrence: z.number().nullable(),
  version: z.number().int(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const skillSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  body: z.string(),
  warnings: z.array(z.string()),
  enabled: z.boolean(),
  version: z.number().int(),
  updatedAt: z.number(),
});
export type Skill = z.infer<typeof skillSchema>;

export const integrationSchema = z.object({
  id,
  provider: z.enum(['github', 'linear']),
  target: z.string(),
  tokenEnv: z.string(),
  enabled: z.boolean(),
  lastSyncAt: z.number().nullable(),
  lastError: z.string().nullable(),
  backoffUntil: z.number().nullable(),
  linked: z.number().int(),
  conflicts: z.number().int(),
  version: z.number().int(),
});
export type IntegrationConnection = z.infer<typeof integrationSchema>;

export const roomSchema = z.object({
  id,
  name: z.string(),
  members: z.array(z.string()),
  createdAt: z.number(),
});
export type Room = z.infer<typeof roomSchema>;
