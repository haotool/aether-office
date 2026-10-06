#!/usr/bin/env node
// Usage: hook-approval.mjs [waitMs]. Synchronous PermissionRequest hook for Claude Code ("Remote approvals", opt-in). Payload on stdin.
// It asks the local AETHER control plane to show the permission prompt in the panel, waits up to a short deadline for a
// person's answer and prints it as Claude's decision JSON. Anything else (no answer, offline, an error, a bad config)
// prints nothing and exits 0: Claude Code then asks in its own terminal as if this hook did not exist. It never decides
// by itself and never allows anything a person did not click: a decision counts only with the control plane's proof
// (an HMAC under a key only that server and this machine's config file hold), so a process squatting the port cannot
// answer for a person.
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_WAIT_MS,
  MAX_RULES,
  MAX_RULE_CHARS,
  proofMatches,
  readApprovalConfig,
} from './approval-config.mjs';

const MAX_INPUT = 1024 * 1024;
const POLL_MS = 20_000;
const CALL_MS = 3_000;

/**
 * Claude Code's own offer for "do not ask again": addRules/allow entries from `permission_suggestions`, pinned to this
 * session. Only these are ever echoed back, so "Allow for this session" can never widen what Claude itself suggested.
 */
export function sessionUpdates(suggestions) {
  return (Array.isArray(suggestions) ? suggestions : [])
    .filter(
      (s) =>
        s?.type === 'addRules' &&
        s.behavior === 'allow' &&
        Array.isArray(s.rules) &&
        s.rules.length > 0 &&
        s.rules.every((r) => typeof r?.toolName === 'string'),
    )
    .slice(0, 3)
    .map((s) => ({ type: 'addRules', behavior: 'allow', destination: 'session', rules: s.rules }));
}
const label = (r) => (r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName);

/** The documented stdout of a PermissionRequest hook for a person's answer. */
export function decisionOutput(answer, updates) {
  const decision = { behavior: answer.behavior };
  if (answer.message) decision.message = answer.message;
  if (answer.behavior === 'allow' && answer.sessionRules && updates.length)
    decision.updatedPermissions = updates;
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } };
}

async function call(base, token, path, init = {}, ms = CALL_MS) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    redirect: 'error', // the token is never sent anywhere the config did not name
    signal: AbortSignal.timeout(ms),
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

/** Returns the decision JSON to print, or null for "no decision: let Claude ask in the terminal". */
export async function requestDecision(payload, config, waitMs, startedAt = Date.now()) {
  if (payload?.hook_event_name !== 'PermissionRequest') return null;
  // "Allow for this session" is offered only when the server will take and show every label whole.
  const offered = sessionUpdates(payload.permission_suggestions);
  const labels = offered.flatMap((u) => u.rules.map(label));
  const updates =
    labels.length <= MAX_RULES && labels.every((l) => l.length <= MAX_RULE_CHARS) ? offered : [];
  const nonce = randomBytes(18).toString('base64url');
  const base = `/api/hook/permission-requests`;
  const deadline = startedAt + waitMs;
  const { id } = await call(config.url, config.token, base, {
    method: 'POST',
    body: JSON.stringify({
      sessionId: payload.session_id,
      cwd: payload.cwd,
      tool: payload.tool_name,
      input: payload.tool_input,
      rules: updates.flatMap((u) => u.rules.map(label)),
      waitMs: Math.max(0, deadline - Date.now()),
      nonce,
    }),
  });
  const answered = (r) =>
    r.decision &&
    proofMatches(
      config.verifyKey,
      {
        id,
        nonce,
        behavior: r.decision.behavior,
        sessionRules: r.decision.sessionRules === true,
      },
      r.proof,
    )
      ? decisionOutput(r.decision, updates)
      : null;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const wait = Math.min(POLL_MS, left);
    const r = await call(
      config.url,
      config.token,
      `${base}/${id}?wait=${wait}&nonce=${nonce}`,
      {},
      wait + CALL_MS,
    );
    if (r.state !== 'pending') return answered(r);
  }
  // The deadline: close the request so a click after this cannot be accepted for a prompt that is already on the
  // terminal. If a person answered in the last instant, that answer is still honoured.
  return answered(
    await call(config.url, config.token, `${base}/${id}/fallback`, {
      method: 'POST',
      body: JSON.stringify({ nonce }),
    }),
  );
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > MAX_INPUT) return;
  }
  const config = readApprovalConfig();
  if (!config) return;
  const wait = Number(process.argv[2] ?? process.env.AETHER_APPROVAL_WAIT_MS);
  const waitMs = Number.isFinite(wait) && wait >= 1000 ? wait : DEFAULT_WAIT_MS;
  const out = await requestDecision(JSON.parse(input), config, waitMs);
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}
