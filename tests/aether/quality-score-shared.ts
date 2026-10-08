import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const load = (name: string) => import(pathToFileURL(resolve('scripts/quality', name)).href);

export const { rule, skipped, info, scoreArea, overall, blockers } = await load('model.mjs');
export const { memoryRepo } = await load('repo.mjs');
export const { findDuplicates } = await load('dup.mjs');
export const { findCycles, deadExports, fanIn, makeResolver } = await load('graph.mjs');
export const { analyzeProject } = await load('ast.mjs');
export const { structure } = await load('areas/structure.mjs');
export const { missingFlags, REQUIRED_FLAGS } = await load('areas/types.mjs');
export const { tests, directlyImported, FLAKY } = await load('areas/tests.mjs');
export const { declarations, measureStyles, mediaViolations, ui } = await load('areas/ui.mjs');
export const { localeKeys, parityGaps, inlinePairs, disabledWithoutReason, a11y } =
  await load('areas/a11y.mjs');
export const { bundleBudgets, firstLoadAssets } = await load('areas/perf.mjs');
export const { unknownCommands, missingPaths, envNames } = await load('areas/docs.mjs');
export const { publicRoutes, routeFindings, security } = await load('areas/security.mjs');
export const { openDecisions, versionFacts } = await load('areas/oss.mjs');
export const { entryScore, parseMaturity, maturity } = await load('areas/maturity.mjs');
export const { findingLocation } = await load('lib.mjs');
export const { raiseFloors, floorProblems, staleness, parseFloors } = await load('floors.mjs');
export const { renderMarkdown, renderTable } = await load('render.mjs');

export const failing = (rules: { id: string; penalty: number }[]) =>
  rules.filter((r) => r.penalty > 0).map((r) => r.id);
