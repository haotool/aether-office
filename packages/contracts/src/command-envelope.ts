import { z } from 'zod';
import { id } from './shared.js';

export const envelope = {
  schemaVersion: z.literal(1),
  idempotencyKey: z.string().min(8).max(100),
  correlationId: id,
};
export const projectEnvelope = { ...envelope, projectId: id };
export const version = z.number().int().nonnegative();

export const command = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.strictObject({ ...projectEnvelope, type: z.literal(type), data });

export const versionedCommand = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.strictObject({ ...projectEnvelope, type: z.literal(type), expectedVersion: version, data });
