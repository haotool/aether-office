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
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
];
const CREDENTIAL_URL_PATTERN = /\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@(?=[^/\s]+)/g;
const SECRET_WORD = 'token|secret|password|passwd|api[_-]?key|account[_-]?key|private[_-]?key';
const SECRET_ASSIGNMENT_PATTERN = new RegExp(
  `(["']?)\\b([A-Za-z0-9_-]{0,64}(?:${SECRET_WORD})[A-Za-z0-9_-]{0,64})\\1\\s*[:=]\\s*(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|[^&\\s,;]+)`,
  'gi',
);
const SECRET_KEY_PATTERN = new RegExp(SECRET_WORD, 'i');
const MAX_DEPTH = 6;

export function redactSecrets(value: string): string {
  let text = value.replace(CREDENTIAL_URL_PATTERN, '[redacted-credential]@');
  text = text.replace(
    SECRET_ASSIGNMENT_PATTERN,
    (_match, quote: string, key: string) => `${quote}${key}${quote}=[redacted]`,
  );
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '[redacted-secret]');
  return text;
}

export function redactStructured(value: unknown, depth = 0): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= MAX_DEPTH) return '[nested]';
  if (Array.isArray(value)) return value.map((item) => redactStructured(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactStructured(item, depth + 1),
    ]),
  );
}
