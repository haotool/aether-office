import { z } from 'zod';
import { id } from './shared.js';
import {
  type Agent,
  type Delivery,
  type Layout,
  type Message,
  type Project,
  type Work,
} from './core.js';

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
