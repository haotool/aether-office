// Area 10: product maturity. The share of ledger entries that are implemented and verified (docs/verification/features.json)
// and, when a maturity audit has been recorded, its per-feature scores (docs/quality/maturity.json).
import { top } from '../lib.mjs';
import { info, rule, skipped } from '../model.mjs';

const LEDGER = 'docs/verification/features.json';
const INPUT = 'docs/quality/maturity.json';
const IMPLEMENTATION = { implemented: 1, partial: 0.5 };
const VERIFICATION = { passed: 1, partial: 0.5 };

/** 0 to 1: half for how far the feature is built, half for how far the checks prove it. */
export const entryScore = (entry) =>
  ((IMPLEMENTATION[entry.implementationStatus] ?? 0) +
    (VERIFICATION[entry.verificationStatus] ?? 0)) /
  2;

const mean = (list) => (list.length === 0 ? 0 : list.reduce((n, x) => n + x, 0) / list.length);

/** `{ "source": "...", "features": [{ "id": "...", "score": 0-100, "note": "..." }] }`; invalid input throws. */
export function parseMaturity(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.features)) throw new Error(`${INPUT}: "features" must be an array`);
  for (const f of data.features)
    if (typeof f.id !== 'string' || !(f.score >= 0 && f.score <= 100))
      throw new Error(`${INPUT}: ${JSON.stringify(f)} needs an id and a score from 0 to 100`);
  return data;
}

export function maturity(repo) {
  const ledger = JSON.parse(repo.read(LEDGER) || '[]');
  const partial = ledger.filter((e) => entryScore(e) < 1);
  const rules = [
    rule({
      id: 'ledger-maturity',
      label:
        'Ledger maturity: mean over entries (implemented and passed = 100, each partial half step = 25 less)',
      weight: 60,
      value: mean(ledger.map(entryScore)) * 100,
      atLeast: 100,
      full: 50,
      details: top(
        partial.map(
          (e) => `${LEDGER} ${e.id}: ${e.implementationStatus} / ${e.verificationStatus}`,
        ),
      ),
      note: `${ledger.length - partial.length} of ${ledger.length} implemented and passed`,
    }),
  ];
  if (!repo.exists(INPUT)) {
    rules.push(
      skipped(
        'maturity-audit',
        'Per-feature maturity scores',
        40,
        `not run: no ${INPUT} (schema in docs/quality/README.md)`,
      ),
    );
    return rules;
  }
  const { features, source = '' } = parseMaturity(repo.read(INPUT));
  const low = features.filter((f) => f.score < 95);
  rules.push(
    rule({
      id: 'maturity-audit',
      label: `Mean feature maturity (${source || INPUT})`,
      weight: 40,
      value: mean(features.map((f) => f.score)),
      atLeast: 100,
      full: 50,
      details: top(low.map((f) => `${f.id}: ${f.score}${f.note ? ` ${f.note}` : ''}`)),
    }),
  );
  rules.push(info('maturity-features', 'Features in the maturity audit', features.length));
  return rules;
}
