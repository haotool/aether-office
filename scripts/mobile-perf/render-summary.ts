import { SCHEMA } from './stats.ts';

type RoundLogRow = {
  index: number;
  caseId: string;
  load1min: number;
  valid?: boolean;
  invalidReason?: string;
};

function headerLines(summary: Record<string, unknown>) {
  return [
    '# Mobile perf run (harness output)',
    '',
    `Schema: \`${summary.schema}\``,
    `Profile: **${summary.profile}** · rounds: ${summary.rounds} (discard first: ${summary.discardFirst})`,
    summary.smoke ? '**Smoke run — not a performance conclusion.**' : '',
    '',
    '## Environment',
    '',
  ];
}

function envLines(summary: Record<string, unknown>) {
  const env = summary.env as Record<string, unknown>;
  return [
    `- Node ${env.node} · Chromium ${env.chromium}`,
    `- Git \`${env.gitHead}\``,
    `- Renderer: ${env.renderer ?? 'n/a'}`,
    `- Load (1m): ${env.load1min}`,
    '',
    '## Case medians',
    '',
    '| Case | renderMs p95 | jsMs p95 | draws | api/min |',
    '| --- | --- | --- | --- | --- |',
  ];
}

function caseTableLines(summary: Record<string, unknown>) {
  const cases = summary.cases as Record<string, Record<string, { median: number }>>;
  return Object.entries(cases ?? {}).map(
    ([id, stats]) =>
      `| ${id} | ${stats.renderMsP95?.median} | ${stats.jsMsP95?.median} | ${stats.drawCalls?.median} | ${stats.apiPerMinute?.median} |`,
  );
}

function deltaLines(summary: Record<string, unknown>) {
  const delta = (summary.delta as { BvsA?: unknown })?.BvsA;
  return [
    '',
    '## Delta B vs A (positive = B improved)',
    '',
    '```json',
    JSON.stringify(delta, null, 2),
    '```',
  ];
}

function noiseFloorLines(summary: Record<string, unknown>) {
  if (!summary.noiseFloor) return [];
  return [
    '',
    '## Noise floor (A/A)',
    '',
    '```json',
    JSON.stringify(summary.noiseFloor, null, 2),
    '```',
  ];
}

function passLines(summary: Record<string, unknown>) {
  return ['', '## Pass evaluation', '', '```json', JSON.stringify(summary.pass, null, 2), '```'];
}

function roundLogLines(summary: Record<string, unknown>) {
  const rows = (summary.roundLog as RoundLogRow[]) ?? [];
  const head = ['', '## Round load samples', ''];
  const body = rows.map(
    (r) =>
      `- round ${r.index} ${r.caseId}: load1m=${r.load1min}${r.valid === false ? ` **${r.invalidReason}**` : ''}`,
  );
  return [...head, ...body];
}

export function renderMarkdown(summary: Record<string, unknown>) {
  return [
    ...headerLines(summary),
    ...envLines(summary),
    ...caseTableLines(summary),
    ...deltaLines(summary),
    ...noiseFloorLines(summary),
    ...passLines(summary),
    ...roundLogLines(summary),
  ]
    .filter(Boolean)
    .join('\n');
}

export function assertSchema(summary: { schema?: string }) {
  if (summary.schema !== SCHEMA) throw new Error(`expected schema ${SCHEMA}`);
}
