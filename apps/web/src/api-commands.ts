import type { Command } from '@aether/contracts';
import { uuid } from './browser-compat.js';
import { api } from './api.js';
export async function execute(
  type: Command['type'],
  data: unknown,
  projectId?: string,
  expectedVersion?: number,
) {
  return api<{ status: 'persisted'; result: Record<string, unknown> }>('/api/commands', {
    method: 'POST',
    body: JSON.stringify({
      schemaVersion: 1,
      type,
      data,
      idempotencyKey: uuid(),
      correlationId: uuid(),
      ...(projectId ? { projectId } : {}),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    }),
  });
}
