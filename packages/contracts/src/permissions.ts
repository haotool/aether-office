import { z } from 'zod';

const PERMISSION_STATES = ['pending', 'allowed', 'denied', 'expired', 'fallback'] as const;
export type PermissionState = (typeof PERMISSION_STATES)[number];

const PERMISSION_MESSAGE_MAX = 300;
export const permissionDecisionSchema = z.strictObject({
  decision: z.enum(['allow', 'deny', 'allow_session']),
  message: z.string().trim().max(PERMISSION_MESSAGE_MAX).optional(),
});
export type PermissionDecisionInput = z.infer<typeof permissionDecisionSchema>;

/** What the panel may show of a request: a redacted, bounded summary, never the raw tool input. */
export type PermissionRequestView = {
  id: string;
  sessionKey: string;
  tool: string;
  summary: string;
  preview: string | null;
  needsReview: boolean;
  sessionRules: string[];
  createdAt: number;
  expiresAt: number;
  state: PermissionState;
  decidedAt: number | null;
};

/**
 * `ok`: loopback or HTTPS. `blocked`: plain HTTP on a network, so a decision is refused. `lan-opt-in`: the same
 * connection, allowed because AETHER_REMOTE_APPROVALS_LAN=1 is set.
 */
export type RemoteApprovalsChannel = 'ok' | 'blocked' | 'lan-opt-in';
export type RemoteApprovalsState = { enabled: boolean; channel: RemoteApprovalsChannel };
