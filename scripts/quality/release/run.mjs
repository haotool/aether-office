// Assembles the release-mode report (CHARTER §5).
import { execFileSync } from 'node:child_process';
import { buildContext } from '../context.mjs';
import { CRITERIA, MEASURED_IDS, criteriaById } from './criteria.mjs';
import {
  buildLayers,
  gatePassed,
  measuredRow,
  overallScore,
  releasePass,
  unmeasuredRow,
} from './compute.mjs';
import { evidenceForCriteria } from './evidence.mjs';
import {
  measureCognitive,
  measureDeadCode,
  measureDirFileCount,
  measureDuplicates,
  measureFanIn,
  measureFileLines,
  measureFlaky,
  measureGitHygiene,
  measureInlineI18n,
  measureLedgerTests,
  measureResiduePaths,
  measureRootItems,
  measureStructureSize,
  measureTypeEscapes,
} from './measure.mjs';

function headSha(root) {
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function evidenceRow(id, ev) {
  const meta = criteriaById[id];
  return {
    id,
    layer: meta.layer,
    type: meta.type,
    status: 'evidence',
    value: ev.credit,
    failAt: meta.failAt ?? null,
    credit: ev.credit,
    source: 'docs/quality/criteria-evidence.json',
    detail: ev.detail,
  };
}

function humanRow(id, ev) {
  const meta = criteriaById[id];
  return {
    id,
    layer: meta.layer,
    type: meta.type,
    status: 'human',
    value: ev.credit,
    failAt: meta.failAt ?? null,
    credit: ev.credit,
    source: 'docs/quality/criteria-evidence.json',
    detail: ev.detail,
  };
}

/** @param {string} root */
export async function scoreRelease(root) {
  const ctx = await buildContext(root);
  const { repo, facts, graph } = ctx;
  let sha = null;
  let gitError = null;
  try {
    sha = headSha(root);
  } catch {
    gitError = `git rev-parse failed under ${root}`;
  }
  const { evidence, error: evidenceError } = sha
    ? evidenceForCriteria(repo, sha)
    : { evidence: new Map(), error: gitError };

  const staticMeasures = {
    'L1-02': () => ({ ...measureTypeEscapes(facts), source: 'scripts/quality/ast.mjs' }),
    'L1-03': () => ({
      ...measureStructureSize(repo, facts),
      source: 'scripts/quality/areas/structure.mjs',
    }),
    'L1-04': () => ({ ...measureCognitive(facts), source: 'scripts/quality/ast.mjs' }),
    'L1-05': () => ({ ...measureDuplicates(repo), source: 'scripts/quality/dup.mjs' }),
    'L1-06': () => ({
      ...measureDeadCode(repo, facts, graph),
      source: 'scripts/quality/graph.mjs',
    }),
    'L1-08': () => ({
      ...measureResiduePaths(repo),
      source: 'scripts/quality/release/measure.mjs',
    }),
    'L1-09': () => ({ ...measureInlineI18n(repo), source: 'scripts/quality/areas/a11y.mjs' }),
    'L2-02': () => ({
      ...measureDirFileCount(repo),
      source: 'scripts/quality/release/measure.mjs',
    }),
    'L2-03': () => ({ ...measureFanIn(graph), source: 'scripts/quality/graph.mjs' }),
    'L2-06': () => ({ ...measureFileLines(repo), source: 'scripts/quality/release/measure.mjs' }),
    'L3-05': () => ({ ...measureLedgerTests(repo), source: 'docs/verification/features.json' }),
    'L3-06': () => ({ ...measureFlaky(repo), source: 'scripts/quality/areas/tests.mjs' }),
    'L7-03': () => ({ ...measureGitHygiene(root), source: 'git' }),
    'L7-04': () => ({ ...measureRootItems(root), source: 'scripts/quality/release/measure.mjs' }),
  };

  const byId = {};
  for (const meta of CRITERIA) {
    const id = meta.id;
    if (MEASURED_IDS.has(id)) {
      if (gitError && (id === 'L7-03' || id === 'L7-04')) {
        byId[id] = { ...unmeasuredRow(id), detail: [gitError] };
        continue;
      }
      const m = staticMeasures[id]();
      const row = measuredRow(id, {
        violations: m.violations,
        value: m.value,
        source: m.source,
        detail: m.detail ?? [],
      });
      byId[id] = row;
      continue;
    }
    if (evidenceError && (meta.type === 'E' || meta.type === 'H')) {
      byId[id] = { ...unmeasuredRow(id), detail: [evidenceError] };
      continue;
    }
    if (meta.type === 'E' && evidence.has(id)) {
      byId[id] = evidenceRow(id, evidence.get(id));
      continue;
    }
    if (meta.type === 'H' && evidence.has(id)) {
      byId[id] = humanRow(id, evidence.get(id));
      continue;
    }
    byId[id] = unmeasuredRow(id);
  }

  const criteria = CRITERIA.map((c) => byId[c.id]);
  const layers = buildLayers(byId);
  const overall = overallScore(layers);
  const unmeasured = criteria.filter((c) => c.status === 'unmeasured').length;
  const gates = Object.fromEntries(
    criteria.filter((c) => c.type === 'G').map((c) => [c.id, gatePassed(c)]),
  );

  return {
    version: 1,
    mode: 'release',
    sha,
    criteria,
    layers,
    overall,
    unmeasured,
    gates,
    evidenceError,
    pass: releasePass({ overall, layers, unmeasured, gates }),
  };
}
