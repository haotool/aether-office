import { z } from 'zod';
import { id, shortText } from './shared.js';
import {
  executionPolicySchema,
  providerSchema,
  speciesSchema,
  terminalDimensions,
  terminalResumeSchema,
} from './core.js';
import { command, envelope, projectEnvelope, versionedCommand } from './command-envelope.js';

export const workbenchCommands = [
  command(
    'terminal.start',
    z.strictObject({
      machineId: id,
      profile: shortText,
      ...terminalDimensions,
      resume: terminalResumeSchema.optional(),
    }),
  ),
  z.strictObject({
    ...projectEnvelope,
    type: z.enum(['terminal.takeover', 'terminal.release', 'terminal.stop']),
    data: z.strictObject({ terminalId: id, epoch: z.number().int().nonnegative() }),
  }),
  command(
    'terminal.input',
    z.strictObject({
      terminalId: id,
      epoch: z.number().int().nonnegative(),
      text: z.string().min(1).max(8192),
    }),
  ),
  command(
    'terminal.resize',
    z.strictObject({
      terminalId: id,
      epoch: z.number().int().nonnegative(),
      ...terminalDimensions,
    }),
  ),
  z.strictObject({
    ...envelope,
    type: z.literal('project.create'),
    data: z.strictObject({ name: shortText, root: z.string().max(4096).optional() }),
  }),
  versionedCommand('project.execution.configure', executionPolicySchema),
  command(
    'agent.register',
    z.strictObject({
      name: shortText,
      role: shortText,
      provider: providerSchema,
      species: speciesSchema,
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }),
  ),
  command(
    'work.create',
    z.strictObject({
      title: shortText,
      description: z.string().max(16000),
      acceptance: z.string().trim().min(1).max(8000),
      dependencies: z.array(id).max(64).default([]),
      priority: z.number().int().min(0).max(3).default(1),
    }),
  ),
  versionedCommand(
    'work.dependencies',
    z.strictObject({ workId: id, dependencies: z.array(id).max(64) }),
  ),
  versionedCommand('work.assign', z.strictObject({ workId: id, agentId: id })),
  versionedCommand(
    'work.submit',
    z.strictObject({
      workId: id,
      result: z.string().min(1).max(32000),
      headSha: z
        .string()
        .regex(/^[0-9a-f]{40,64}$/)
        .optional(),
    }),
  ),
  versionedCommand('work.request_review', z.strictObject({ workId: id, agentId: id })),
  versionedCommand(
    'work.review',
    z.strictObject({
      workId: id,
      decision: z.enum(['approve', 'changes_requested']),
      body: z.string().min(1).max(8000),
    }),
  ),
  versionedCommand(
    'work.verify',
    z.strictObject({ workId: id, verifier: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }),
  ),
  versionedCommand('workspace.diff', z.strictObject({ workId: id })),
  versionedCommand('work.accept', z.strictObject({ workId: id })),
  versionedCommand(
    'work.extend',
    z.strictObject({ workId: id, reason: z.string().trim().min(1).max(2000) }),
  ),
  versionedCommand(
    'work.retry',
    z.strictObject({ workId: id, resume: z.boolean().default(false) }),
  ),
  versionedCommand('work.cancel', z.strictObject({ workId: id })),
] as const;
