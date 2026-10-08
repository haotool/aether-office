// Structured gate results (`aether-quality-gates/1`) for release G criteria.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { criteriaById } from './criteria.mjs';

const SCHEMA = 'aether-quality-gates/1';

function headSha(root) {
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function porcelainLines(root) {
  return execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean).length;
}

/** @param {unknown} raw @param {string} root */
export function validateGatesFile(raw, root) {
  if (!raw || typeof raw !== 'object') {
    return { gates: new Map(), error: 'gates file must be a JSON object' };
  }
  const doc = /** @type {Record<string, unknown>} */ (raw);
  if (doc.schema !== SCHEMA) {
    return { gates: new Map(), error: `gates schema must be ${SCHEMA}` };
  }
  let expectedSha;
  try {
    expectedSha = headSha(root);
  } catch {
    return { gates: new Map(), error: 'gates unavailable: git rev-parse failed' };
  }
  if (doc.sha !== expectedSha) {
    return {
      gates: new Map(),
      error: `gates sha ${doc.sha ?? '?'} does not match HEAD ${expectedSha}`,
    };
  }
  const dirty = doc.dirty;
  if (dirty !== 0 && dirty !== '0') {
    return {
      gates: new Map(),
      error: `gates dirty must be 0 (file had ${dirty})`,
    };
  }
  const lines = porcelainLines(root);
  if (lines !== 0) {
    return {
      gates: new Map(),
      error: `gates dirty must be 0 (working tree has ${lines} changed paths)`,
    };
  }
  if (!Array.isArray(doc.gates)) {
    return { gates: new Map(), error: 'gates must be an array' };
  }
  const out = new Map();
  const seen = new Set();
  for (const entry of doc.gates) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
      return { gates: new Map(), error: 'each gate entry must be an object with id string' };
    }
    const meta = criteriaById[entry.id];
    if (!meta || meta.type !== 'G') {
      return { gates: new Map(), error: `gate id ${entry.id} is not a G criterion` };
    }
    if (seen.has(entry.id)) {
      return { gates: new Map(), error: `duplicate gate id ${entry.id}` };
    }
    seen.add(entry.id);
    if (!Number.isInteger(entry.exit)) {
      return { gates: new Map(), error: `gate ${entry.id} exit must be an integer` };
    }
    out.set(entry.id, entry);
  }
  return { gates: out, error: null };
}

/** @param {import('../repo.mjs').Repo} repo @param {string} gatesPath repo-relative or absolute */
export function loadGates(repo, gatesPath) {
  const abs = path.isAbsolute(gatesPath) ? gatesPath : path.join(repo.root, gatesPath);
  let rawText;
  try {
    rawText = readFileSync(abs, 'utf8');
  } catch {
    return { gates: new Map(), error: null, missing: true };
  }
  let raw;
  try {
    raw = JSON.parse(rawText);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      gates: new Map(),
      error: `gates unavailable: invalid JSON in ${gatesPath} (${message})`,
      missing: false,
    };
  }
  const validated = validateGatesFile(raw, repo.root);
  return { ...validated, missing: false };
}

export function gateRow(id, entry) {
  const meta = criteriaById[id];
  const passed = entry.exit === 0;
  return {
    id,
    layer: meta.layer,
    type: meta.type,
    status: 'measured',
    value: entry.exit,
    failAt: meta.failAt ?? null,
    credit: passed ? 1 : 0,
    source: entry.command ?? 'quality:gates',
    detail: [
      `exit ${entry.exit}`,
      ...(entry.durationMs != null ? [`durationMs ${entry.durationMs}`] : []),
    ],
  };
}

export { SCHEMA };
