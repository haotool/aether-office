// Runs the area modules and assembles the report object that scorecard.json stores.
import { a11y } from './areas/a11y.mjs';
import { docs } from './areas/docs.mjs';
import { maturity } from './areas/maturity.mjs';
import { oss } from './areas/oss.mjs';
import { perf } from './areas/perf.mjs';
import { security } from './areas/security.mjs';
import { structure } from './areas/structure.mjs';
import { tests } from './areas/tests.mjs';
import { types } from './areas/types.mjs';
import { ui } from './areas/ui.mjs';
import { buildContext } from './context.mjs';
import { overall, scoreArea } from './model.mjs';

export const REPORT_VERSION = 1;

/** name -> [title, measure(repo, context)] in the order the report lists them. */
export const AREAS = {
  structure: ['Structure', (repo, ctx) => structure(repo, ctx)],
  types: ['Types and correctness gates', (repo, ctx) => types(repo, ctx)],
  tests: ['Tests', (repo, ctx) => tests(repo, ctx)],
  ui: ['UI system and design tokens', (repo) => ui(repo)],
  a11y: ['Accessibility and i18n', (repo) => a11y(repo)],
  perf: ['Performance budgets', (repo) => perf(repo)],
  docs: ['Docs truth', (repo, ctx) => docs(repo, ctx)],
  security: ['Security and privacy gates', (repo, ctx) => security(repo, ctx)],
  oss: ['Open-source readiness', (repo, ctx) => oss(repo, ctx)],
  maturity: ['Product maturity', (repo) => maturity(repo)],
};

const NEEDS_READINESS = new Set(['docs', 'security', 'oss']);

async function readinessResults(root) {
  const { run } = await import('../oss/readiness-check.mjs');
  return run({ root, history: false, maintainerEmails: [], maxHistoryMb: 5, skipGitleaks: false });
}

/** Scores the named areas (all when `names` is empty) of the repository at `root`. */
export async function scoreRepository(root, names = []) {
  const selected = names.length ? names : Object.keys(AREAS);
  const unknown = selected.filter((n) => !AREAS[n]);
  if (unknown.length)
    throw new Error(
      `unknown area: ${unknown.join(', ')} (known: ${Object.keys(AREAS).join(', ')})`,
    );
  const context = await buildContext(root);
  const readiness = selected.some((n) => NEEDS_READINESS.has(n))
    ? await readinessResults(root)
    : [];
  const areas = [];
  for (const name of selected) {
    const [title, measure] = AREAS[name];
    areas.push(scoreArea(name, title, await measure(context.repo, { ...context, readiness })));
  }
  return { version: REPORT_VERSION, overall: overall(areas), areas };
}
