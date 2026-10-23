import type { FastifyInstance } from 'fastify';
import { DomainError, type Actor } from '@aether/kernel';
import type { SyncOptions } from '../services/domain/integrations.js';
import type { Control } from '../control.js';
import type { PairingStore } from '../services/remote/pairing.js';

export type ServerOptions = {
  origin: string;
  /** Also accept requests addressed to this machine's private-network address (see services/host-policy.ts). */
  lan?: boolean;
  /**
   * The reverse proxies whose `X-Forwarded-*` headers to believe (AETHER_TRUST_PROXY): addresses or CIDR ranges, comma
   * separated. Unset (the default) believes none, so a forged header changes nothing. See docs/security.md.
   */
  trustProxy?: string;
  localSignIn?: boolean;
  serveWeb?: boolean;
  dataDir?: string;
  lanAddresses?: (port: string) => string[];
  logger?: boolean;
  logStream?: { write(line: string): void };
  /** Test seam: fetch policy and environment for connectors. Defaults are the secure ones. */
  connectors?: SyncOptions;
  a2a?: boolean;
  routeLog?: { method: string; url: string }[];
  sessionStream?: { scanMs?: number; heartbeatMs?: number; maxClients?: number };
};

export type AuthInput = {
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string | undefined>;
  method: string;
};

export type RouteContext = {
  app: FastifyInstance;
  control: Control;
  options: ServerOptions;
  origin: URL;
  actor: (request: AuthInput) => Actor;
  attempts: Map<string, { count: number; until: number }>;
  pairings: PairingStore;
  streams: Set<() => void>;
};

export function requireOperator(who: Actor): void {
  if (!['owner', 'operator'].includes(who.role) || who.agentId || who.machineId)
    throw new DomainError('FORBIDDEN', 403);
}

export function repositoryRoot(control: Control, projectId: string): string {
  const row = control.ctx.sqlite.prepare('SELECT root FROM projects WHERE id=?').get(projectId) as
    { root: string | null } | undefined;
  if (!row?.root) throw new DomainError('PROJECT_HAS_NO_REPOSITORY', 404);
  return row.root;
}
