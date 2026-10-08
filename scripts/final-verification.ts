import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// docs/verification/report.md is generated from docs/verification/features.json so it can never claim more than the
// feature ledger records. Implementation and verification stay separate; "passed" never means
// "complete", and every non-passed row shows its blockers.

export type Feature = {
  id: string;
  requirement: string;
  implementationStatus: 'not_started' | 'partial' | 'implemented';
  verificationStatus: 'not_run' | 'partial' | 'passed' | 'failed' | 'blocked' | 'not_applicable';
  codePaths?: string[];
  testIds: string[];
  blockers: string[];
};

const ORDER = ['passed', 'partial', 'blocked', 'failed', 'not_run', 'not_applicable'] as const;
const MEANING: Record<(typeof ORDER)[number], string> = {
  passed: 'Verified by the listed tests at the scope stated in the ledger.',
  partial: 'Some behaviour is verified; the blockers column names what is not.',
  blocked:
    'Cannot be verified in this environment (for example, it needs paid or authenticated provider sessions).',
  failed: 'A check ran and failed.',
  not_run: 'No check has been run.',
  not_applicable: 'Does not apply to this product.',
};

/** Ledger integrity: every claim must point at real files, and a pass must name its checks. */
export function validateLedger(
  features: readonly Feature[],
  exists: (path: string) => boolean,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const blockerOwner = new Map<string, string>();
  for (const f of features) {
    if (seen.has(f.id)) problems.push(`${f.id}: duplicate id`);
    seen.add(f.id);
    // A blocker says what is missing for this row; one sentence pasted into many rows hides which gap is real.
    for (const b of f.blockers) {
      const owner = blockerOwner.get(b);
      if (owner && owner !== f.id) problems.push(`${f.id}: blocker copied from ${owner}`);
      blockerOwner.set(b, f.id);
    }
    for (const p of f.codePaths ?? [])
      if (!exists(p)) problems.push(`${f.id}: code path missing: ${p}`);
    for (const t of f.testIds)
      if (!exists(t.split('#')[0] ?? t)) problems.push(`${f.id}: test missing: ${t}`);
    if (f.verificationStatus === 'passed' && f.testIds.length === 0)
      problems.push(`${f.id}: passed without any test or script`);
    if (f.implementationStatus !== 'not_started' && !(f.codePaths ?? []).length)
      problems.push(`${f.id}: implemented without code paths`);
    if (f.implementationStatus === 'not_started' && f.verificationStatus === 'passed')
      problems.push(`${f.id}: verified but not implemented`);
  }
  return problems;
}

export function renderReport(features: readonly Feature[], generatedFor: string): string {
  const by = (status: string) => features.filter((f) => f.verificationStatus === status);
  const impl = (status: Feature['implementationStatus']) =>
    features.filter((f) => f.implementationStatus === status).length;
  const lines = [
    '# Final verification',
    '',
    `Generated from \`docs/verification/features.json\` (${generatedFor}). Do not edit by hand: run \`pnpm verification:report\`.`,
    '',
    `Features: **${features.length}**. Implementation: ${impl('implemented')} implemented, ${impl('partial')} partial, ${impl('not_started')} not started.`,
    '',
    '| Verification | Count | Meaning |',
    '|---|---|---|',
    ...ORDER.map((s) => `| ${s} | ${by(s).length} | ${MEANING[s]} |`),
    '',
    'A passing build or test run is not a claim of production readiness. This file lists what the ledger can support, and what it cannot.',
  ];
  for (const status of ORDER) {
    const rows = by(status);
    if (!rows.length) continue;
    lines.push(
      '',
      `## ${status} (${rows.length})`,
      '',
      '| ID | Implementation | Requirement | Blockers |',
      '|---|---|---|---|',
    );
    for (const f of rows)
      lines.push(
        `| ${f.id} | ${f.implementationStatus} | ${f.requirement.replace(/\|/g, '\\|')} | ${f.blockers.map((b) => b.replace(/\|/g, '\\|')).join('; ') || '—'} |`,
      );
  }
  return lines.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = JSON.parse(readFileSync('docs/verification/features.json', 'utf8')) as
    Feature[] | { features: Feature[] };
  const features = Array.isArray(raw) ? raw : raw.features;
  const problems = validateLedger(features, existsSync);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const output = renderReport(features, 'docs/verification/features.json');
  if (process.argv.includes('--check')) {
    const current = (() => {
      try {
        return readFileSync('docs/verification/report.md', 'utf8');
      } catch {
        return '';
      }
    })();
    if (current !== output) {
      console.error('docs/verification/report.md is stale: run pnpm verification:report');
      process.exit(1);
    }
  } else writeFileSync('docs/verification/report.md', output);
}
