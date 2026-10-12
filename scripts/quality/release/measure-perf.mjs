import { RECORD, readRecord } from '../../mobile-perf/record.mjs';
import { codeTrees, staleTrees } from '../../ux-matrix-summary.mjs';

const REGENERATE = 'regenerate with: pnpm run perf:evidence, then pnpm run perf:record -- --write';
const LIMITS = {
  drawCalls: 100,
  triangles: 150_000,
  gpuMegabytes: 64,
  webglContexts: 1,
  coldStartBytes: 3 * 1024 * 1024,
  heapGrowthPct: 10,
  soakMinutes: 10,
};
const COLD_START_STEP = 100 * 1024;

/** @param {string} root */
function currentRecord(root) {
  const record = readRecord(root);
  if (!record) return { unmeasured: true, detail: [`missing ${RECORD}`, REGENERATE] };
  const stale = staleTrees(record, codeTrees(root));
  if (stale.length)
    return { unmeasured: true, detail: [`${RECORD} is stale for ${stale.join(', ')}`, REGENERATE] };
  return { record };
}

export function measureSceneBudget(root) {
  const { record, ...failed } = currentRecord(root);
  if (!record) return failed;
  const { drawCalls, triangles, gpuMegabytes, webglContexts } = record.scene;
  const violations = [
    drawCalls > LIMITS.drawCalls,
    triangles > LIMITS.triangles,
    gpuMegabytes > LIMITS.gpuMegabytes,
    webglContexts !== LIMITS.webglContexts,
  ].filter(Boolean).length;
  return {
    violations,
    value: violations,
    detail: [
      `${drawCalls} draw calls, ${triangles} triangles, ${gpuMegabytes} MB GPU, ${webglContexts} WebGL context(s)`,
    ],
  };
}

export function measureColdStart(root) {
  const { record, ...failed } = currentRecord(root);
  if (!record) return failed;
  const { transferBytes } = record.coldStart;
  const violations = Math.ceil(
    Math.max(0, transferBytes - LIMITS.coldStartBytes) / COLD_START_STEP,
  );
  return {
    violations,
    value: Math.round(transferBytes / 1024),
    detail: [`${Math.round(transferBytes / 1024)} KB transferred`],
  };
}

export function measureSoak(root) {
  const { record, ...failed } = currentRecord(root);
  if (!record) return failed;
  const { minutes, growthPct } = record.soak;
  if (minutes < LIMITS.soakMinutes)
    return {
      unmeasured: true,
      detail: [`the soak ran ${minutes} min, ${LIMITS.soakMinutes} are required`, REGENERATE],
    };
  return {
    violations: Math.ceil(Math.max(0, growthPct - LIMITS.heapGrowthPct)),
    value: growthPct,
    detail: [`heap grew ${growthPct}% over ${minutes} min`],
  };
}
