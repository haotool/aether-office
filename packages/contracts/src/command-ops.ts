import { z } from 'zod';
import { id, shortText } from './shared.js';
import { scheduleSpecSchema, scheduleTemplateSchema } from './core.js';
import { command, versionedCommand } from './command-envelope.js';

export const opsCommands = [
  command(
    'machine.invite',
    z.strictObject({
      name: shortText,
      ttlSec: z.number().int().min(60).max(900).default(600),
      concurrency: z.number().int().min(1).max(4).default(1),
      providers: z
        .array(z.enum(['demo', 'claude', 'codex', 'acp']))
        .min(1)
        .max(4),
      roots: z.array(z.string().min(1).max(1024)).min(1).max(16),
    }),
  ),
  command(
    'integration.connect',
    z.discriminatedUnion('provider', [
      z.strictObject({
        provider: z.literal('github'),
        owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/),
        repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
        tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
        webhookSecretEnv: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
          .optional(),
        baseUrl: z.url().optional(),
      }),
      z.strictObject({
        provider: z.literal('linear'),
        teamKey: z.string().regex(/^[A-Za-z0-9]{1,16}$/),
        tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
        baseUrl: z.url().optional(),
      }),
    ]),
  ),
  versionedCommand(
    'integration.toggle',
    z.strictObject({ integrationId: id, enabled: z.boolean() }),
  ),
  command('skill.import', z.strictObject({ content: z.string().min(1).max(70000) })),
  versionedCommand('skill.toggle', z.strictObject({ skillId: id, enabled: z.boolean() })),
  command(
    'schedule.create',
    z.strictObject({
      name: shortText,
      spec: scheduleSpecSchema,
      timezone: z.string().min(1).max(64).default('Asia/Taipei'),
      missed: z.enum(['skip', 'single']).default('skip'),
      template: scheduleTemplateSchema,
    }),
  ),
  versionedCommand('schedule.toggle', z.strictObject({ scheduleId: id, enabled: z.boolean() })),
  versionedCommand(
    'work.integrate',
    z.strictObject({
      workId: id,
      baseBranch: z.string().regex(/^[\w./-]{1,100}$/),
      expectedBase: z.string().regex(/^[0-9a-f]{40}$/),
    }),
  ),
  command(
    'work.comment',
    z.strictObject({
      workId: id,
      headSha: z.string().regex(/^[0-9a-f]{40}$/),
      path: z.string().min(1).max(512),
      hunkHash: z.string().regex(/^[0-9a-f]{64}$/),
      line: z.number().int().positive().optional(),
      body: z.string().min(1).max(4000),
    }),
  ),
  command(
    'reservation.acquire',
    z.strictObject({
      patterns: z.array(z.string().min(1).max(256)).min(1).max(32),
      ttlSec: z.number().int().min(30).max(3600).default(600),
      workId: id.optional(),
    }),
  ),
  command(
    'reservation.renew',
    z.strictObject({ reservationId: id, ttlSec: z.number().int().min(30).max(3600).default(600) }),
  ),
  command('reservation.release', z.strictObject({ reservationId: id })),
] as const;
