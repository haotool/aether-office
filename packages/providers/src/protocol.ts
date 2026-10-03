import { z } from 'zod';
import type { Provider } from '@aether/contracts';
export type Capabilities = {
  provider: Provider;
  transport: 'app-server' | 'agent-sdk' | 'acp' | 'fixture' | 'observe';
  start: boolean;
  resume: boolean;
  interrupt: boolean;
  terminate: boolean;
  structuredEvents: boolean;
  toolEvents: boolean;
  permissionRequests: boolean;
  usage: boolean;
  ptyAttach: boolean;
  externalObservation: boolean;
  messageInjection: 'mid_turn' | 'turn_boundary' | 'none';
};
export const capabilities: Record<Provider, Capabilities> = {
  codex: {
    provider: 'codex',
    transport: 'app-server',
    start: true,
    resume: true,
    interrupt: true,
    terminate: true,
    structuredEvents: true,
    toolEvents: true,
    permissionRequests: true,
    usage: true,
    ptyAttach: false,
    externalObservation: false,
    messageInjection: 'mid_turn',
  },
  claude: {
    provider: 'claude',
    transport: 'agent-sdk',
    start: true,
    resume: true,
    interrupt: true,
    terminate: true,
    structuredEvents: true,
    toolEvents: true,
    permissionRequests: true,
    usage: true,
    ptyAttach: false,
    externalObservation: false,
    messageInjection: 'turn_boundary',
  },
  acp: {
    provider: 'acp',
    transport: 'acp',
    start: true,
    resume: false,
    interrupt: true,
    terminate: true,
    structuredEvents: true,
    toolEvents: true,
    permissionRequests: true,
    usage: false,
    ptyAttach: false,
    externalObservation: false,
    messageInjection: 'turn_boundary',
  },
  demo: {
    provider: 'demo',
    transport: 'fixture',
    start: true,
    resume: false,
    interrupt: true,
    terminate: true,
    structuredEvents: true,
    toolEvents: false,
    permissionRequests: false,
    usage: false,
    ptyAttach: false,
    externalObservation: false,
    messageInjection: 'none',
  },
  observe: {
    provider: 'observe',
    transport: 'observe',
    start: false,
    resume: false,
    interrupt: false,
    terminate: false,
    structuredEvents: true,
    toolEvents: false,
    permissionRequests: false,
    usage: false,
    ptyAttach: false,
    externalObservation: true,
    messageInjection: 'none',
  },
};
export { providerEventSchema, type ProviderEvent } from '@aether/contracts';
import type { ProviderEvent } from '@aether/contracts';
export type Permission = {
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
