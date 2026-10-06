import { z } from 'zod';
import { id, shortText } from './shared.js';
import {
  executionPolicySchema,
  layoutSchema,
  providerSchema,
  scheduleSpecSchema,
  scheduleTemplateSchema,
  speciesSchema,
  terminalDimensions,
  terminalResumeSchema,
} from './core.js';

const envelope = {
  schemaVersion: z.literal(1),
  idempotencyKey: z.string().min(8).max(100),
  correlationId: id,
};
const projectEnvelope = { ...envelope, projectId: id };
const version = z.number().int().nonnegative();

export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...projectEnvelope,
      type: z.literal('terminal.start'),
      data: z
        .object({
          machineId: id,
          profile: shortText,
          ...terminalDimensions,
          resume: terminalResumeSchema.optional(),
        })
        .strict(),
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
      type: z.literal('meeting.start'),
      data: z
        .object({
          topic: shortText,
          question: z.string().trim().min(1).max(8000),
          participants: z.array(id).min(2).max(12),
          maxRounds: z.number().int().min(2).max(12).default(6),
          deadlineMinutes: z.number().int().min(5).max(240).default(30),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('meeting.conclude'),
      data: z.object({ threadId: id, decision: z.string().trim().min(1).max(8000) }).strict(),
    })
    .strict(),
  z
    .object({
      ...projectEnvelope,
      type: z.literal('workflow.start'),
      data: z
        .object({
          template: z.enum([
            'claude_codex_review',
            'codex_claude_review',
            'frontend_backend',
            'research_design_impl',
          ]),
          title: shortText,
          description: z.string().max(16000).default(''),
          acceptance: z.string().trim().min(1).max(8000),
          priority: z.number().int().min(0).max(3).default(1),
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
