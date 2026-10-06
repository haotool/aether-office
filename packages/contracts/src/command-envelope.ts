import { z } from 'zod';
import { id } from './shared.js';

export const envelope = {
  schemaVersion: z.literal(1),
  idempotencyKey: z.string().min(8).max(100),
  correlationId: id,
};
export const projectEnvelope = { ...envelope, projectId: id };
export const version = z.number().int().nonnegative();
