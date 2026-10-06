import { z } from 'zod';
import { id, shortText } from './shared.js';
import { scheduleSpecSchema, scheduleTemplateSchema } from './core.js';
import { projectEnvelope, version } from './command-envelope.js';

/** Machine, integration, skill, schedule, integration-branch and reservation commands. */
export const opsCommands = [
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
] as const;
