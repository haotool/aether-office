/**
 * Secret redaction for text shown from agent transcripts.
 * The patterns are adapted from stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.),
 * src/shared/crash-report-redaction.ts at commit 373d951b; see THIRD_PARTY_NOTICES.md.
 * Paths are kept (they say what an agent is working on); credentials are not.
 */
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  // AETHER additions: JSON web tokens and Google API keys.
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
];
const CREDENTIAL_URL_PATTERN = /\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@(?=[^/\s]+)/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|secret|password|account[_-]?key)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^&\s,;]+)/gi;

export function redactSecrets(value: string): string {
  let text = value.replace(CREDENTIAL_URL_PATTERN, '[redacted-credential]@');
  text = text.replace(SECRET_ASSIGNMENT_PATTERN, (_match, key: string) => `${key}=[redacted]`);
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[redacted-secret]');
  return text;
}
