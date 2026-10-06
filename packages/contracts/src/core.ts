import { z } from 'zod';
import { id, shortText } from './shared.js';

export const modeSchema = z.enum(['demo', 'live', 'observe']);
export const providerSchema = z.enum(['demo', 'claude', 'codex', 'acp', 'observe']);
export const workStateSchema = z.enum([
  'backlog',
  'ready',
  'assigned',
  'running',
  'reviewing',
  'changes_requested',
  'verified',
  'completed',
  'blocked',
  'cancel_requested',
  'cancelled',
  'failed',
  'indeterminate',
]);
export const activitySchema = z.enum([
  'idle',
  'starting',
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
  'offline',
  'error',
  'unknown',
]);
export const speciesSchema = z.enum([
  'fox',
  'cat',
  'rabbit',
  'bear',
  'otter',
  'raccoon',
  'panda',
  'dog',
]);
export const projectSchema = z.object({
  id,
  name: shortText,
  root: z.string().nullable(),
  mode: modeSchema,
  version: z.number().int(),
  createdAt: z.number(),
});
export const agentSchema = z.object({
  id,
  projectId: id,
  name: shortText,
  role: shortText,
  provider: providerSchema,
  mode: modeSchema,
  species: speciesSchema,
  color: z.string(),
  activity: activitySchema,
  version: z.number().int(),
  createdAt: z.number(),
  lastSeen: z.number().nullable(),
});
export const workSchema = z.object({
  id,
  projectId: id,
  title: shortText,
  description: z.string(),
  acceptance: z.string(),
  state: workStateSchema,
  assignee: id.nullable(),
  version: z.number().int(),
  priority: z.number().int(),
  createdAt: z.number(),
  updatedAt: z.number(),
  attempt: z.number().int(),
  maxAttempts: z.number().int().min(3).max(100),
  cancelCause: id.nullable(),
  result: z.string().nullable(),
  submittedBy: z.string().nullable(),
  headSha: z.string().nullable(),
  reviewBy: z.string().nullable(),
  verifiedSha: z.string().nullable(),
});
export const messageSchema = z.object({
  id,
  projectId: id,
  threadId: id,
  replyTo: id.nullable(),
  senderId: z.string(),
  body: z.string(),
  kind: z.enum(['inform', 'request', 'decision', 'handoff']),
  createdAt: z.number(),
  expiresAt: z.number(),
  roomId: id.nullable().default(null),
});
export const messageWaitSchema = z.object({
  messageId: id,
  recipientId: id,
  projectId: id,
  workId: id.nullable(),
  runId: id.nullable(),
  state: z.enum(['pending', 'responded', 'expired', 'cancelled']),
  deadline: z.number().int(),
  replyId: id.nullable(),
  endedAt: z.number().int().nullable(),
});
export type MessageWait = z.infer<typeof messageWaitSchema>;
export const deliveryStateSchema = z.enum([
  'available',
  'injected',
  'acknowledged',
  'responded',
  'failed',
  'expired',
  'cancelled',
]);
export const deliverySchema = z.object({
  sequence: z.string().regex(/^\d+$/),
  messageId: id,
  recipientId: id,
  state: deliveryStateSchema,
  acknowledgedAt: z.number().nullable(),
});
/** Who sits at a desk: an agent AETHER manages, or a session it only observes (`local:` and the session's key; a subagent never has a desk of its own). */
const seatedSchema = z.union([
  id,
  z
    .string()
    .regex(/^local:[A-Za-z0-9._:-]{1,190}$/)
    .refine((value) => !value.includes(':sub:')),
]);
const deskLikeSchema = z
  .object({
    id: shortText,
    type: z.enum(['desk', 'plant', 'sofa', 'rack', 'table']),
    x: z.number().finite().min(-24).max(24),
    z: z.number().finite().min(-16).max(16),
    rotation: z.number().int().min(0).max(3),
    agentId: seatedSchema.nullable().default(null),
    // The building has one floor per department (0 = Product Engineering). Layouts saved before floors existed are floor 0.
    floor: z.number().int().min(0).max(4).default(0),
  })
  .strict();
/** A squad zone: the floor space beside a supervisor's desk where its subagents sit. It is floor, not furniture. */
const squadSchema = z
  .object({
    id: shortText,
    type: z.literal('squad'),
    x: z.number().finite().min(-24).max(24),
    z: z.number().finite().min(-16).max(16),
    rotation: z.number().int().min(0).max(3),
    floor: z.number().int().min(0).max(4).default(0),
    agentId: z.null().default(null),
    // The supervisor desk's object id, on the same floor.
    anchor: shortText,
    span: z.tuple([
      z.number().min(3).max(12).multipleOf(0.5),
      z.number().min(2.5).max(8).multipleOf(0.5),
    ]),
    // 0 = the zone grows and shrinks with its squad; n = at least n reserved seats.
    seats: z.number().int().min(0).max(12).default(0),
  })
  .strict();
export const furnitureSchema = z.discriminatedUnion('type', [deskLikeSchema, squadSchema]);
// Version 1 is every layout saved before squad zones; version 2 is written only when the layout holds a squad zone, so a
// layout without squads stays readable by an older server or client. Every version-1 layout is a valid version-2 layout.
export const layoutSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    objects: z.array(furnitureSchema).max(600),
    zones: z.array(z.object({ id: shortText, name: shortText })).max(9),
  })
  .strict()
  .refine((l) => l.schemaVersion === 2 || l.objects.every((o) => o.type !== 'squad'), {
    message: 'A squad zone needs layout version 2',
    path: ['schemaVersion'],
  });
export type Layout = z.infer<typeof layoutSchema>;
export type Furniture = Layout['objects'][number];
export type SquadObject = Extract<Furniture, { type: 'squad' }>;
export const executionPolicySchema = z
  .object({
    liveEnabled: z.boolean(),
    maxTurns: z.number().int().min(1).max(20),
    timeoutMs: z.number().int().min(1000).max(600000),
  })
  .strict();
export const terminalDimensions = {
  cols: z.number().int().min(10).max(400),
  rows: z.number().int().min(2).max(200),
};
/** Start a terminal by resuming (or forking) an existing provider session in the profile's directory. */
export const terminalResumeSchema = z
  .object({
    provider: z.enum(['claude', 'codex']),
    // Never starts with a dash: it is a positional argument of the CLI, not something it could read as a flag.
    sessionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{7,199}$/),
    fork: z.boolean(),
  })
  .strict();
export type TerminalResume = z.infer<typeof terminalResumeSchema>;
export const scheduleSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), at: z.number().int().positive() }).strict(),
  z
    .object({ kind: z.literal('daily'), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
    .strict(),
  z
    .object({
      kind: z.literal('weekly'),
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict(),
]);
export const scheduleTemplateSchema = z
  .object({
    title: shortText,
    description: z.string().max(16000).default(''),
    acceptance: z.string().trim().min(1).max(8000),
    priority: z.number().int().min(0).max(3).default(1),
  })
  .strict();
export type Agent = z.infer<typeof agentSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Work = z.infer<typeof workSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type Mode = z.infer<typeof modeSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Provider = z.infer<typeof providerSchema>;
