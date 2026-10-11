import { z } from 'zod';
import { id, shortText } from './shared.js';
import { layoutSchema, scheduleTemplateSchema } from './core.js';
import { command, versionedCommand } from './command-envelope.js';

export const collabCommands = [
  command(
    'message.send',
    z
      .strictObject({
        // Either explicit recipients or a room, never both: a room's members are the recipients.
        recipients: z.array(id).max(32).default([]),
        roomId: id.optional(),
        body: z.string().trim().min(1).max(16000),
        kind: z.enum(['inform', 'request', 'decision', 'handoff']).default('inform'),
        threadId: id.optional(),
        replyTo: id.optional(),
        ttlMs: z.number().int().min(1000).max(604800000).default(86400000),
      })
      .refine((d) => (d.roomId ? d.recipients.length === 0 : d.recipients.length >= 1), {
        message: 'Provide recipients or a roomId, not both and not neither',
      }),
  ),
  command('message.ack', z.strictObject({ messageId: id, recipientId: id })),
  versionedCommand('layout.save', layoutSchema),
  versionedCommand(
    'approval.decide',
    z.strictObject({
      approvalId: id,
      actionHash: z.string().regex(/^[a-f0-9]{64}$/),
      decision: z.enum(['approve', 'deny']),
    }),
  ),
  versionedCommand(
    'knowledge.approve',
    z.strictObject({
      knowledgeId: id,
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().min(1).max(2000),
    }),
  ),
  command(
    'knowledge.propose',
    z.strictObject({
      title: shortText,
      body: z.string().min(1).max(32000),
      source: z.string().trim().min(1).max(2048),
      workId: id.optional(),
      artifactId: id.optional(),
      commitSha: z
        .string()
        .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
        .optional(),
    }),
  ),
  command(
    'meeting.start',
    z.strictObject({
      topic: shortText,
      question: z.string().trim().min(1).max(8000),
      participants: z.array(id).min(2).max(12),
      maxRounds: z.number().int().min(2).max(12).default(6),
      deadlineMinutes: z.number().int().min(5).max(240).default(30),
    }),
  ),
  command(
    'meeting.conclude',
    z.strictObject({ threadId: id, decision: z.string().trim().min(1).max(8000) }),
  ),
  command(
    'workflow.start',
    scheduleTemplateSchema.extend({
      template: z.enum([
        'claude_codex_review',
        'codex_claude_review',
        'frontend_backend',
        'research_design_impl',
      ]),
    }),
  ),
  command('room.create', z.strictObject({ name: shortText, members: z.array(id).min(1).max(32) })),
  command('room.members', z.strictObject({ roomId: id, members: z.array(id).min(1).max(32) })),
  command(
    'a2a.client.create',
    z.strictObject({ name: shortText, maxOpen: z.number().int().min(1).max(100).default(10) }),
  ),
  command('a2a.client.revoke', z.strictObject({ clientId: id })),
] as const;
