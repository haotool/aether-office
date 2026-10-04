import { z } from 'zod';
import { id } from './shared.js';
import { scheduleSpecSchema, scheduleTemplateSchema } from './core.js';

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

export const workflowSchema = z.object({
  id,
  template: z.string(),
  title: z.string(),
  steps: z.array(
    z.object({
      workId: id,
      role: z.string(),
      position: z.number().int(),
      engineerProvider: z.string().nullable(),
      reviewerProvider: z.string().nullable(),
      state: z.string(),
    }),
  ),
});
export type Workflow = z.infer<typeof workflowSchema>;
