// E/H criteria evidence file (docs/quality/criteria-evidence.json).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { criteriaById } from './criteria.mjs';

const ALLOWED_CREDIT = new Set([0, 0.5, 1]);
const EVIDENCE_PATH = 'docs/quality/criteria-evidence.json';

/** @param {string} root @param {string} file repo-relative */
export function resolveEvidencePath(root, file) {
  const posix = file.replace(/\\/g, '/');
  const normalized = path.posix.normalize(posix);
  if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized))
    return null;
  const abs = path.resolve(root, normalized);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return normalized;
}

export function loadEvidence(repo) {
  if (!repo.exists(EVIDENCE_PATH)) return { entries: [], error: null };
  let raw;
  try {
    raw = JSON.parse(repo.read(EVIDENCE_PATH));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      entries: [],
      error: `criteria evidence unavailable: invalid JSON in ${EVIDENCE_PATH} (${message})`,
    };
  }
  if (!Array.isArray(raw)) {
    return {
      entries: [],
      error: `criteria evidence unavailable: ${EVIDENCE_PATH} must be a JSON array`,
    };
  }
  return { entries: raw, error: null };
}

function isAncestor(root, sha, head) {
  try {
    execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', sha, head], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/** @returns {{ id: string, credit: number, detail: string[] } | { error: string }} */
export function evidenceRow(repo, entry, headSha) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
    return {
      error: `criteria evidence unavailable: each entry must be an object with an id string`,
    };
  }
  const detail = [];
  if (!criteriaById[entry.id]) detail.push(`unknown criterion id ${entry.id}`);
  if (typeof entry.credit !== 'number' || !ALLOWED_CREDIT.has(entry.credit))
    detail.push(`credit must be 0, 0.5, or 1`);
  for (const file of entry.files ?? []) {
    if (typeof file !== 'string') {
      detail.push('files entries must be strings');
      continue;
    }
    const resolved = resolveEvidencePath(repo.root, file);
    if (!resolved) detail.push(`path not allowed ${file}`);
    else if (!repo.exists(resolved)) detail.push(`missing file ${file}`);
  }
  if (entry.sha && typeof entry.sha === 'string' && !isAncestor(repo.root, entry.sha, headSha))
    detail.push(`sha ${entry.sha} is not an ancestor of HEAD`);
  if (detail.length) {
    return { error: `criteria evidence unavailable: ${entry.id}: ${detail.join('; ')}` };
  }
  return {
    id: entry.id,
    credit: entry.credit,
    detail: [
      ...(entry.note ? [entry.note] : []),
      ...(entry.reviewers?.length ? [`reviewers: ${entry.reviewers.join(', ')}`] : []),
      ...(entry.files?.length ? [`files: ${entry.files.join(', ')}`] : []),
      ...(entry.sha ? [`sha: ${entry.sha}`] : []),
    ],
  };
}

export function evidenceForCriteria(repo, headSha) {
  const loaded = loadEvidence(repo);
  if (loaded.error) return { evidence: new Map(), error: loaded.error };

  const out = new Map();
  const seen = new Set();
  for (const entry of loaded.entries) {
    if (seen.has(entry?.id)) {
      return {
        evidence: new Map(),
        error: `criteria evidence unavailable: duplicate criterion id ${entry.id} in ${EVIDENCE_PATH}`,
      };
    }
    if (entry && typeof entry.id === 'string') seen.add(entry.id);
    const row = evidenceRow(repo, entry, headSha);
    if ('error' in row) return { evidence: new Map(), error: row.error };
    out.set(row.id, row);
  }
  return { evidence: out, error: null };
}

export { EVIDENCE_PATH };
