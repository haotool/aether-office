import { z } from 'zod';
import { id } from './shared.js';
import { scheduleSpecSchema, scheduleTemplateSchema } from './core.js';

export type FileReservation = {
  id: string;
  ownerId: string;
  workId: string | null;
  patterns: string[];
  fence: number;
  state: 'active' | 'expired' | 'released';
  expiresAt: number;
  advisory: true;
};

export type ReviewComments = {
  head: string | null;
  hunks: { path: string; header: string; hash: string }[];
  comments: {
    id: string;
    workId: string;
    authorId: string;
    headSha: string;
    path: string;
    hunkHash: string;
    line: number | null;
    body: string;
    createdAt: number;
    status: 'current' | 'carried' | 'stale' | 'unknown';
  }[];
};

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

export type Room = { id: string; name: string; members: string[]; createdAt: number };

export type Workflow = {
  id: string;
  template: string;
  title: string;
  steps: {
    workId: string;
    role: string;
    position: number;
    engineerProvider: string | null;
    reviewerProvider: string | null;
    state: string;
  }[];
};
