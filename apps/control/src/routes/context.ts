import type { FastifyInstance } from 'fastify';
import { DomainError, type Actor } from '@aether/kernel';
import type { SyncOptions } from '../services/integrations.js';
import type { Control } from '../control.js';
import type { PairingStore } from '../services/pairing.js';

export type ServerOptions = {
  origin: string;
  /** Also accept requests addressed to this machine's private-network address (see services/host-policy.ts). */
  lan?: boolean;
  /**
   * The reverse proxies whose `X-Forwarded-*` headers to believe (AETHER_TRUST_PROXY): addresses or CIDR ranges, comma
   * separated. Unset (the default) believes none, so a forged header changes nothing. See docs/security.md.
   */
  trustProxy?: string;
  serveWeb?: boolean;
  /** The data directory: where the usage KPIs keep their numbers-only rollup between runs (none: memory only). */
  dataDir?: string;
  /** Test seam: the addresses pairing links point at (defaults to this machine's private-network interfaces). */
  lanAddresses?: (port: string) => string[];
  logger?: boolean;
  /** Test seam: where structured logs go (defaults to stdout). */
  logStream?: { write(line: string): void };
  /** Test seam: fetch policy and environment for connectors. Defaults are the secure ones. */
  connectors?: SyncOptions;
  /** Enable the A2A gateway. Defaults to the AETHER_A2A=on environment switch; off otherwise. */
  a2a?: boolean;
  /** Test seam: collects every route as it is registered, so tests can sweep them all. */
  routeLog?: { method: string; url: string }[];
  /** Test seam: the local-session stream's scan interval, heartbeat and client cap (defaults in routes/session-stream.ts). */
  sessionStream?: { scanMs?: number; heartbeatMs?: number; maxClients?: number };
};

export type AuthInput = {
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string | undefined>;
  method: string;
};

/** What every route group needs from the server that registers it. */
export type RouteContext = {
  app: FastifyInstance;
  control: Control;
  options: ServerOptions;
  origin: URL;
  /** Who is calling: a bearer token, or a browser session with its CSRF token on mutations. Throws when neither holds. */
  actor: (request: AuthInput) => Actor;
  /** Failed-attempt counters by caller (login, enrolment, A2A), shared so one limit cannot be dodged by another route. */
  attempts: Map<string, { count: number; until: number }>;
  /** Codes that sign a phone in by scanning (services/pairing.ts). */
  pairings: PairingStore;
  /** Closers of the open event streams, called when the server shuts down. */
  streams: Set<() => void>;
};

/** A human owner or operator: not an agent, not a runner. */
export function requireOperator(who: Actor): void {
  if (!['owner', 'operator'].includes(who.role) || who.agentId || who.machineId)
    throw new DomainError('FORBIDDEN', 403);
}

/** The repository root a project was adopted from; fails when it has none. */
export function repositoryRoot(control: Control, projectId: string): string {
  const row = control.ctx.sqlite.prepare('SELECT root FROM projects WHERE id=?').get(projectId) as
    { root: string | null } | undefined;
  if (!row?.root) throw new DomainError('PROJECT_HAS_NO_REPOSITORY', 404);
  return row.root;
}
