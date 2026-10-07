// The scoring model. A rule measures one number; the penalty is the rule's weight times how far the number is past its
// limit, as a share of `full` (the excess at which the whole weight is lost). An area scores 100 minus its penalties.
// A rule that could not be measured is `skipped` and costs nothing, but the area reports how much weight it measured.

const round = (n, places = 2) => Number(n.toFixed(places));

/** A measured rule. `details` are the exact `file:line` (or message) lines behind the value. */
export function rule({
  id,
  label,
  weight,
  value,
  limit = 0,
  atLeast,
  full,
  unit = '',
  details = [],
  note,
}) {
  const minimum = atLeast !== undefined;
  const bound = minimum ? atLeast : limit;
  const span = full ?? Math.max(bound, 1);
  const over = Math.max(0, minimum ? bound - value : value - bound);
  const penalty = round(weight * Math.min(1, over / span));
  return {
    id,
    label,
    status: penalty > 0 ? 'fail' : 'pass',
    weight,
    value: round(value),
    limit: bound,
    ...(minimum ? { minimum: true } : {}),
    full: span,
    unit,
    penalty,
    details,
    ...(note ? { note } : {}),
  };
}

/** A rule that needs something that is not there (a build, a browser run, a binary). Costs nothing; says why. */
export const skipped = (id, label, weight, reason) => ({
  id,
  label,
  status: 'skipped',
  weight,
  value: null,
  limit: null,
  full: null,
  unit: '',
  penalty: 0,
  details: [],
  note: reason,
});

/** A number reported for information only: never penalised. */
export const info = (id, label, value, details = [], note) => ({
  id,
  label,
  status: 'info',
  weight: 0,
  value,
  limit: null,
  full: null,
  unit: '',
  penalty: 0,
  details,
  ...(note ? { note } : {}),
});

export function scoreArea(name, title, rules) {
  const measured = rules.filter((r) => r.status !== 'skipped' && r.status !== 'info');
  const total = rules.filter((r) => r.status !== 'info').reduce((n, r) => n + r.weight, 0);
  const measuredWeight = measured.reduce((n, r) => n + r.weight, 0);
  const penalty = measured.reduce((n, r) => n + r.penalty, 0);
  return {
    name,
    title,
    // Under half the weight measured is too little evidence for a number: the area is reported as n/a.
    score: measuredWeight * 2 < total ? null : round(Math.max(0, 100 - penalty), 1),
    measured: total === 0 ? 100 : Math.round((measuredWeight / total) * 100),
    rules,
  };
}

/** What stops an area from reaching `target`: its failing rules, largest penalty first. */
export const blockers = (area) =>
  area.rules
    .filter((r) => r.penalty > 0)
    .sort((a, b) => b.penalty - a.penalty || a.id.localeCompare(b.id));

export function overall(areas) {
  const scored = areas.filter((a) => a.score !== null);
  return scored.length === 0
    ? null
    : round(scored.reduce((n, a) => n + a.score, 0) / scored.length, 1);
}
