// Blocks CI when pnpm audit reports unexempted high or critical advisories. Exceptions live in
// docs/security/audit-exceptions.json with an expiry date.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ALLOWED_SEVERITIES = new Set(['info', 'low', 'moderate']);
const BLOCKED_SEVERITIES = new Set(['high', 'critical']);
const DEFAULT_EXCEPTIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/security/audit-exceptions.json',
);

/** @typedef {{ advisory: string, package: string, reason: string, expires: string }} AuditException */

/**
 * @param {unknown} raw pnpm audit advisory `severity` field
 * @returns {{ block: false, severity: string } | { block: true, severity: string, unreadable: boolean }}
 */
export function classifyAdvisorySeverity(raw) {
  if (typeof raw !== 'string') {
    return { block: true, severity: 'unreadable', unreadable: true };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') {
    return { block: true, severity: 'unreadable', unreadable: true };
  }
  if (ALLOWED_SEVERITIES.has(normalized)) {
    return { block: false, severity: normalized };
  }
  if (BLOCKED_SEVERITIES.has(normalized)) {
    return { block: true, severity: normalized, unreadable: false };
  }
  return { block: true, severity: 'unreadable', unreadable: true };
}

/**
 * @param {unknown} audit
 * @returns {Array<{ id: string, advisory: string, package: string, severity: string, severityUnreadable: boolean }>}
 */
export function listBlockedFindings(audit) {
  if (!audit || typeof audit !== 'object') return [];
  const root = /** @type {Record<string, unknown>} */ (audit);
  const advisories = root.advisories;
  if (advisories && typeof advisories === 'object' && !Array.isArray(advisories)) {
    /** @type {Array<{ id: string, advisory: string, package: string, severity: string, severityUnreadable: boolean }>} */
    const out = [];
    for (const entry of Object.values(/** @type {Record<string, unknown>} */ (advisories))) {
      if (!entry || typeof entry !== 'object') continue;
      const row = /** @type {Record<string, unknown>} */ (entry);
      const classified = classifyAdvisorySeverity(row.severity);
      if (!classified.block) continue;
      const pkg = String(row.module_name ?? '');
      const githubId = row.github_advisory_id != null ? String(row.github_advisory_id) : '';
      const numericId = row.id != null ? String(row.id) : '';
      out.push({
        id: numericId || githubId || pkg,
        advisory: githubId || numericId,
        package: pkg,
        severity: classified.severity,
        severityUnreadable: classified.unreadable,
      });
    }
    return out;
  }
  const meta = root.metadata;
  if (meta && typeof meta === 'object') {
    const vulns = /** @type {Record<string, unknown>} */ (meta).vulnerabilities;
    if (vulns && typeof vulns === 'object') {
      const counts = /** @type {Record<string, unknown>} */ (vulns);
      const high = Number(counts.high ?? 0);
      const critical = Number(counts.critical ?? 0);
      if (high + critical > 0) {
        return [
          {
            id: 'unknown',
            advisory: 'unknown',
            package: '*',
            severity: critical > 0 ? 'critical' : 'high',
            severityUnreadable: false,
          },
        ];
      }
    }
  }
  return [];
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {Date} [now]
 */
export function isExpired(isoDate, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return true;
  const expires = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
  return now.getTime() > expires;
}

/**
 * @param {AuditException[]} exceptions
 */
export function validateExceptions(exceptions) {
  if (!Array.isArray(exceptions)) throw new Error('audit exceptions must be a JSON array');
  for (const row of exceptions) {
    if (!row || typeof row !== 'object') throw new Error('each audit exception must be an object');
    for (const key of ['advisory', 'package', 'reason', 'expires']) {
      if (typeof row[key] !== 'string' || row[key].trim() === '') {
        throw new Error(`audit exception field "${key}" must be a non-empty string`);
      }
    }
  }
  return exceptions;
}

/**
 * @param {{ advisory: string, package: string }} finding
 * @param {AuditException} rule
 */
function exceptionMatches(finding, rule) {
  const adv = rule.advisory.trim();
  const pkg = rule.package.trim();
  const advOk = adv === '*' || adv === finding.advisory || adv === finding.id;
  const pkgOk = pkg === '*' || pkg === finding.package;
  return advOk && pkgOk;
}

/**
 * @param {unknown} audit
 * @param {AuditException[]} exceptions
 * @param {Date} [now]
 */
export function evaluateAudit(audit, exceptions, now = new Date()) {
  const findings = listBlockedFindings(audit);
  /** @type {typeof findings} */
  const blocked = [];
  /** @type {Array<{ finding: (typeof findings)[number], rule: AuditException }>} */
  const expired = [];
  for (const finding of findings) {
    const matching = exceptions.filter((rule) => exceptionMatches(finding, rule));
    if (matching.length === 0) {
      blocked.push(finding);
      continue;
    }
    const active = matching.find((rule) => !isExpired(rule.expires, now));
    if (active) continue;
    expired.push({ finding, rule: matching[0] });
  }
  return { ok: blocked.length === 0 && expired.length === 0, blocked, expired };
}

/**
 * @param {string} path
 * @returns {{ exceptions: AuditException[] } | { error: string }}
 */
export function loadExceptionsFromFile(path) {
  if (!existsSync(path)) {
    return { error: 'audit gate: audit exceptions file not found' };
  }
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `audit gate: could not read audit exceptions file (${msg})` };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'audit gate: could not parse audit exceptions JSON' };
  }
  try {
    return { exceptions: validateExceptions(parsed) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `audit gate: invalid audit exceptions (${msg})` };
  }
}

/**
 * @param {string} path
 */
export function loadExceptions(path = DEFAULT_EXCEPTIONS) {
  const loaded = loadExceptionsFromFile(path);
  if ('error' in loaded) throw new Error(loaded.error);
  return loaded.exceptions;
}

/**
 * @param {string} text
 * @returns {{ audit: unknown } | { error: string }}
 */
export function parseAuditJsonInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { error: 'audit gate: audit JSON input is empty or invalid' };
  }
  try {
    return { audit: JSON.parse(text) };
  } catch {
    return { error: 'audit gate: could not parse audit JSON input' };
  }
}

/**
 * @param {{ blocked: ReturnType<typeof listBlockedFindings>, expired: Array<{ finding: unknown, rule: AuditException }> }} result
 */
export function formatFailure(result) {
  const lines = ['audit gate: high or critical vulnerabilities must be fixed or time-boxed.'];
  for (const row of result.blocked) {
    const label = row.severityUnreadable ? 'severity unreadable' : row.severity;
    lines.push(`  blocked: ${row.package} ${row.advisory} (${label})`);
  }
  for (const { finding, rule } of result.expired) {
    lines.push(
      `  expired exception: ${finding.package} ${finding.advisory} (expired ${rule.expires}) — ${rule.reason}`,
    );
  }
  return lines.join('\n');
}

/**
 * @param {string} [exceptionsPath]
 * @param {{ auditJson?: string, now?: Date, skipAudit?: boolean, audit?: unknown }} [opts]
 */
export function runGate(exceptionsPath = DEFAULT_EXCEPTIONS, opts = {}) {
  const loaded = loadExceptionsFromFile(exceptionsPath);
  if ('error' in loaded) {
    console.error(loaded.error);
    return 2;
  }
  const exceptions = loaded.exceptions;
  let audit = opts.audit;
  if (audit == null && opts.auditJson !== undefined) {
    const parsed = parseAuditJsonInput(opts.auditJson);
    if ('error' in parsed) {
      console.error(parsed.error);
      return 2;
    }
    audit = parsed.audit;
  }
  if (audit == null && !opts.skipAudit) {
    const child = spawnSync('pnpm', ['audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    const text = (child.stdout ?? '').trim() || (child.stderr ?? '').trim();
    if (!text) {
      console.error('audit gate: pnpm audit produced no JSON output');
      return 2;
    }
    try {
      audit = JSON.parse(text);
    } catch {
      console.error('audit gate: could not parse pnpm audit JSON');
      return 2;
    }
  }
  const result = evaluateAudit(audit, exceptions, opts.now ?? new Date());
  if (result.ok) {
    console.log('audit gate: ok (no unexempted high or critical advisories)');
    return 0;
  }
  console.error(formatFailure(result));
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const custom = process.argv[2];
  const path = custom && existsSync(custom) ? resolve(custom) : DEFAULT_EXCEPTIONS;
  process.exit(runGate(path));
}
