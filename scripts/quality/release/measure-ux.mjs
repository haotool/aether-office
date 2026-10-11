import { RECORD, codeTrees, readRecord, staleTrees } from '../../ux-matrix-summary.mjs';

const REGENERATE = 'regenerate with: pnpm run ux:matrix, then pnpm run ux:summary -- --write';
const MISSING_STATES = 5;

/** @param {string} root */
function currentRecord(root) {
  const record = readRecord(root);
  if (!record) return { unmeasured: true, detail: [`missing ${RECORD}`, REGENERATE] };
  const stale = staleTrees(record, codeTrees(root));
  if (stale.length)
    return { unmeasured: true, detail: [`${RECORD} is stale for ${stale.join(', ')}`, REGENERATE] };
  return { record };
}

export function measureTouchTargets(root) {
  const { record, ...failed } = currentRecord(root);
  if (!record) return failed;
  const cells = [record.core, record.states].flatMap((part) => [
    part.smallTargets,
    part.axeSerious,
  ]);
  const violations = cells.reduce((sum, n) => sum + n, 0);
  return {
    violations,
    value: violations,
    detail: [`${violations} cells with a small target or a serious axe violation`],
  };
}

export function measureStateMatrix(root) {
  const { record, ...failed } = currentRecord(root);
  if (!record) return failed;
  const { states } = record;
  const violations =
    (states.complete ? 0 : MISSING_STATES) +
    states.overflow +
    states.axeSerious +
    states.unexpectedErrors;
  return {
    violations,
    value: states.cells,
    detail: [`${states.cells} state cells, ${violations} problems`],
  };
}
