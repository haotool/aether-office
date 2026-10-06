import { z } from 'zod';
import { id, shortText } from './shared.js';
import {
  executionPolicySchema,
  providerSchema,
  speciesSchema,
  terminalDimensions,
  terminalResumeSchema,
} from './core.js';
import { envelope, projectEnvelope, version } from './command-envelope.js';

/** Terminal, project, agent and work commands. */
export const workbenchCommands = [
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
] as const;
