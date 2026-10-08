// L4-03 and L4-08 read the UX matrix record that `pnpm run ux:summary -- --write` makes (docs/verification/ux-matrix.md).
import { RECORD, codeTrees, readRecord, staleTrees } from '../../ux-matrix-summary.mjs';

const REGENERATE = 'regenerate with: pnpm run ux:matrix, then pnpm run ux:summary -- --write';
const MISSING_STATES = 5; // L4-08 failAt: a state matrix that is not complete is a failure

/** @param {string} root */
function currentRecord(root) {
  const record = readRecord(root);
  if (!record) return { unmeasured: true, detail: [`missing ${RECORD}`, REGENERATE] };
  const stale = staleTrees(record, codeTrees(root));
  if (stale.length)
    return { unmeasured: true, detail: [`${RECORD} is stale for ${stale.join(', ')}`, REGENERATE] };
  return { record };
}

/** L4-03: cells with a touch target under 24 px or a serious axe violation (contrast included). */
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

/** L4-08: the loading, error, empty, offline, reduced-motion and overlay states, each screenshot and checked. */
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
