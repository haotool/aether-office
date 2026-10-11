// Its own module: the control plane imports it, and a bundle containing the hook script itself would run that script as
// its main. The hook runs from a private copy of this file and of hook-approval.mjs (see approval-install.ts), so
// nothing here may import from the repository.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export const DEFAULT_WAIT_MS = 45_000;
export const MAX_RULES = 3;
export const MAX_RULE_CHARS = 120;
/** The random value the hook sends with a request; the server's proof is bound to it, so an answer cannot be replayed. */
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
export const aetherDir = (env = process.env) => env.AETHER_HOME ?? join(homedir(), '.aether');
export function approvalConfigPath(env = process.env) {
  return env.AETHER_APPROVALS_CONFIG ?? join(aetherDir(env), 'approvals.json');
}

export function readApprovalConfig(file = approvalConfigPath()) {
  try {
    const { url, token, verifyKey } = JSON.parse(readFileSync(file, 'utf8'));
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' || !LOOPBACK.has(parsed.hostname)) return null; // the token never leaves this machine
    const strong = (v) => typeof v === 'string' && v.length >= 32;
    return strong(token) && strong(verifyKey) ? { url: parsed.origin, token, verifyKey } : null;
  } catch {
    return null;
  }
}

/**
 * The server's proof that a person gave this answer: an HMAC under the key only the control plane and the hook share.
 * It binds the request, the hook's nonce and the answer, so a process squatting the port cannot forge or replay one.
 */
export function approvalProof(key, { id, nonce, behavior, sessionRules }) {
  return createHmac('sha256', key)
    .update(`${id}|${nonce}|${behavior}|${sessionRules ? 1 : 0}`)
    .digest('hex');
}
export function proofMatches(key, fields, proof) {
  if (typeof proof !== 'string') return false;
  const expected = Buffer.from(approvalProof(key, fields));
  const given = Buffer.from(proof);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A directory only this user can enter, even when it already existed with looser rights; never a link. */
export function ensurePrivateDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (lstatSync(dir).isSymbolicLink()) throw new Error('APPROVAL_DIR_LINKED');
  chmodSync(dir, 0o700);
}

/** Atomic and private: a new file under a random name (never an existing one), then a rename; a link in the way is refused. */
export function writePrivateFile(file, content, mode = 0o600) {
  try {
    if (lstatSync(file).isSymbolicLink()) throw new Error('APPROVAL_FILE_LINKED');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const tmp = join(dirname(file), `.${basename(file)}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    writeFileSync(tmp, content, { flag: 'wx', mode });
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}
