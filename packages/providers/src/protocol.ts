import { z } from 'zod';
export { providerEventSchema, type ProviderEvent } from '@aether/contracts';
import type { ProviderEvent } from '@aether/contracts';
type Permission = {
  requestId: string;
  kind: string;
  toolId: string;
  turnId: string;
  providerSessionId: string;
  parameters: Record<string, unknown>;
};
export type NativeSink = {
  event: (event: ProviderEvent) => Promise<void>;
  permission: (permission: Permission) => Promise<'approve' | 'deny'>;
  permissionSent?: (requestId: string) => Promise<void>;
  processStarted: (identity: string) => Promise<void>;
};
export type NativeOptions = {
  readOnlyReview?: boolean;
  binary: string;
  cwd: string;
  model?: string;
  resumeSessionId?: string;
  maxTurns: number;
  timeoutMs: number;
  mcpConfig?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
};
export const record = (value: unknown): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(value);
export const text = (value: unknown, max = 32000): string =>
  typeof value === 'string' ? value.slice(0, max) : '';
