import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  approvalConfigPath,
  approvalProof,
  ensurePrivateDir,
  readApprovalConfig,
  writePrivateFile,
  type ApprovalProofFields,
} from '@aether/providers/approval-config';
import { DomainError } from '@aether/kernel';
import type { RemoteApprovalsChannel } from '@aether/contracts';
import type { Context } from '../domain/context.js';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const row = (ctx: Context) =>
  ctx.sqlite.prepare('SELECT enabled,tokenHash FROM remote_approvals WHERE id=1').get() as
    { enabled: number; tokenHash: string | null } | undefined;

export const remoteApprovals = (ctx: Context) => ({ enabled: row(ctx)?.enabled === 1 });

const loopbackHost = (host: string | undefined) => {
  try {
    const name = new URL(`http://${host}`).hostname;
    return name === 'localhost' || name === '[::1]' || /^127\./.test(name);
  } catch {
    return false;
  }
};

/**
 * Can an answer be carried safely on this connection? A decision rides on a session cookie, which plain HTTP over a
 * network does not protect: only a loopback address or an HTTPS origin counts, unless AETHER_REMOTE_APPROVALS_LAN=1.
 */
export function approvalChannel(
  origin: URL,
  host: string | undefined,
  env: Record<string, string | undefined> = process.env,
): RemoteApprovalsChannel {
  if (origin.protocol === 'https:' || loopbackHost(host)) return 'ok';
  return env['AETHER_REMOTE_APPROVALS_LAN'] === '1' ? 'lan-opt-in' : 'blocked';
}

/**
 * Switches Remote approvals on: a fresh token (its hash is the only copy kept here), a fresh key for the server's
 * proofs, and the file the hook reads them from, mode 0600 in a 0700 ~/.aether. Switching on again rotates both. Off by
 * default.
 */
export function enableRemoteApprovals(ctx: Context, origin: string) {
  const token = randomBytes(32).toString('base64url');
  const verifyKey = randomBytes(32).toString('base64url');
  const file = approvalConfigPath();
  try {
    ensurePrivateDir(dirname(file));
    writePrivateFile(file, `${JSON.stringify({ url: origin, token, verifyKey })}\n`);
  } catch {
    throw new DomainError('APPROVALS_PATH_UNSAFE', 409); // a link or a bad path: nothing was written
  }
  ctx.sqlite
    .prepare(
      'INSERT INTO remote_approvals(id,enabled,tokenHash,updatedAt) VALUES (1,1,?,?) ON CONFLICT(id) DO UPDATE SET enabled=1,tokenHash=excluded.tokenHash,updatedAt=excluded.updatedAt',
    )
    .run(sha(token), ctx.now());
  return { enabled: true };
}

/** Off: the token stops working and the hook's file is removed, so the hook falls back to the terminal at once. */
export function disableRemoteApprovals(ctx: Context) {
  ctx.sqlite
    .prepare(
      'INSERT INTO remote_approvals(id,enabled,tokenHash,updatedAt) VALUES (1,0,NULL,?) ON CONFLICT(id) DO UPDATE SET enabled=0,tokenHash=NULL,updatedAt=excluded.updatedAt',
    )
    .run(ctx.now());
  rmSync(approvalConfigPath(), { force: true });
  return { enabled: false };
}

/** True only while Remote approvals is on and the token is the one issued for the hook. Constant time. */
export function isHookToken(ctx: Context, token: string): boolean {
  const current = row(ctx);
  if (!current || current.enabled !== 1 || !current.tokenHash || token.length > 256) return false;
  const a = Buffer.from(sha(token));
  const b = Buffer.from(current.tokenHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The proof the hook checks before it prints a decision; absent when the key file cannot be read (the hook then falls back). */
export function proofFor(
  id: string,
  nonce: string,
  decision: { behavior: 'allow' | 'deny'; sessionRules: boolean },
) {
  const key = readApprovalConfig()?.verifyKey;
  const fields: ApprovalProofFields = { id, nonce, ...decision };
  return key ? approvalProof(key, fields) : undefined;
}
