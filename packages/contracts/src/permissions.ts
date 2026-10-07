import { z } from 'zod';

/** Remote approvals: a Claude Code permission prompt answered from the panel (see docs/security.md). */
const PERMISSION_STATES = ['pending', 'allowed', 'denied', 'expired', 'fallback'] as const;
export type PermissionState = (typeof PERMISSION_STATES)[number];

const PERMISSION_MESSAGE_MAX = 300;
export const permissionDecisionSchema = z
  .object({
    decision: z.enum(['allow', 'deny', 'allow_session']),
    message: z.string().trim().max(PERMISSION_MESSAGE_MAX).optional(),
  })
  .strict();
export type PermissionDecisionInput = z.infer<typeof permissionDecisionSchema>;

/** What the panel may show of a request: a redacted, bounded summary, never the raw tool input. */
export type PermissionRequestView = {
  id: string;
  /** "claude:<session id>", the key the session feed uses. */
  sessionKey: string;
  tool: string;
  /** One line: the command or the file. */
  summary: string;
  /** The command or the change, cut short; null when the tool has nothing more to show. */
  preview: string | null;
  /** True when the one-line summary is not the whole call (several lines, cut short, a change): Allow needs the preview read. */
  needsReview: boolean;
  /** The rules "Allow for this session" would add, as Claude Code offered them (empty: the option is not offered). */
  sessionRules: string[];
  createdAt: number;
  /** When the hook stops waiting and Claude asks in the terminal. */
  expiresAt: number;
  state: PermissionState;
  decidedAt: number | null;
};

/**
 * Can an answer travel on this connection? `ok`: loopback or HTTPS. `blocked`: plain HTTP on a network, so a decision is
 * refused. `lan-opt-in`: the same connection, allowed because AETHER_REMOTE_APPROVALS_LAN=1 is set.
 */
export type RemoteApprovalsChannel = 'ok' | 'blocked' | 'lan-opt-in';
export type RemoteApprovalsState = { enabled: boolean; channel: RemoteApprovalsChannel };
