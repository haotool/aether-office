// CHARTER §5.1 credit and layer/overall scores for release mode.
import { CRITERIA, LAYER_WEIGHTS, criteriaById } from './criteria.mjs';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round1 = (n) => Number(n.toFixed(1));

/** @param {number} violations @param {number} failAt */
export function creditM(violations, failAt) {
  if (failAt <= 0) return violations === 0 ? 1 : 0;
  return clamp(1 - violations / failAt, 0, 1);
}

/** @param {{ type: string, credit: number, status: string }} row */
export function gatePassed(row) {
  if (row.type !== 'G') return undefined;
  return row.status === 'measured' && row.credit >= 1;
}

/**
 * @param {import('./criteria.mjs').CRITERIA[number]['id'][]} ids
 * @param {Record<string, { credit: number, type: string, status: string, violations?: number, value?: number }>} byId
 */
export function layerResult(layer, ids, byId) {
  const rows = ids.map((id) => byId[id]);
  const gFailed = rows.some((r) => r.type === 'G' && r.credit < 1);
  const avg = rows.reduce((n, r) => n + r.credit, 0) / rows.length;
  let score = round1(100 * avg);
  if (gFailed) score = Math.min(score, 80);
  return { layer, score, gFailed, criteria: rows.length };
}

export function overallScore(layerScores) {
  let sum = 0;
  for (const [layer, weight] of Object.entries(LAYER_WEIGHTS)) {
    sum += (layerScores[layer] ?? 0) * weight;
  }
  return round1(sum / 100);
}

export function buildLayers(byId) {
  const layers = {};
  for (const layer of Object.keys(LAYER_WEIGHTS)) {
    const ids = CRITERIA.filter((c) => c.layer === layer).map((c) => c.id);
    layers[layer] = layerResult(layer, ids, byId).score;
  }
  return layers;
}

export function releasePass(report) {
  if (report.unmeasured !== 0) return false;
  if (report.overall < 95) return false;
  if (Object.values(report.layers).some((s) => s < 90)) return false;
  if (Object.values(report.gates).some((ok) => !ok)) return false;
  return true;
}

export function unmeasuredRow(id) {
  const meta = criteriaById[id];
  return {
    id,
    layer: meta.layer,
    type: meta.type,
    status: 'unmeasured',
    value: null,
    failAt: meta.failAt ?? null,
    credit: 0,
    source: meta.measure ?? 'charter',
    detail: ['Deferred to a follow-up work package'],
  };
}

export function measuredRow(id, { violations, value, source, detail = [] }) {
  const meta = criteriaById[id];
  let credit;
  let status = 'measured';
  if (meta.type === 'M') credit = creditM(violations, meta.failAt ?? 1);
  else if (meta.type === 'G') credit = violations === 0 ? 1 : 0;
  else credit = 0;
  return {
    id,
    layer: meta.layer,
    type: meta.type,
    status,
    value: value ?? violations,
    failAt: meta.failAt ?? null,
    credit,
    source,
    detail,
  };
}
