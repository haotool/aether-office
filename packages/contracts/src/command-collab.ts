import { z } from 'zod';
import { id, shortText } from './shared.js';
import { layoutSchema } from './core.js';
import { projectEnvelope, version } from './command-envelope.js';

/** Message, layout, approval, knowledge, meeting, workflow, room and A2A client commands. */
export const collabCommands = [
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
] as const;
