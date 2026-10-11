// The ratchet: floors only go up, and a committed scorecard must match what the repository measures today.
export const DEFAULT_TARGET = 95;

export function parseFloors(text) {
  if (!text) return { target: DEFAULT_TARGET, floors: {} };
  const data = JSON.parse(text);
  return { target: data.target ?? DEFAULT_TARGET, floors: data.floors ?? {} };
}

export const serializeFloors = (floors) => `${JSON.stringify(floors, null, 2)}\n`;

export function raiseFloors(floors, report) {
  const next = { ...floors.floors };
  for (const area of report.areas)
    if (area.score !== null) next[area.name] = Math.max(next[area.name] ?? 0, area.score);
  return { target: floors.target, floors: next };
}

export function floorProblems(report, floors) {
  const problems = [];
  for (const area of report.areas) {
    if (area.score === null) continue;
    const floor = floors.floors[area.name];
    if (floor === undefined)
      problems.push(`${area.name}: no floor recorded (run pnpm run quality:report)`);
    else if (area.score < floor)
      problems.push(`${area.name}: ${area.score} is below its floor ${floor}`);
  }
  return problems;
}

const key = (r) => `${r.status}|${r.value}|${r.penalty}`;

/**
 * Differences between the committed report and a fresh one. A rule that is "skipped" on either side is not compared
 * (it needs a build, a binary or a recorded run that this machine may lack); everything else must match exactly.
 */
export function staleness(committed, fresh) {
  const diffs = [];
  const old = new Map(committed.areas.map((a) => [a.name, a]));
  for (const area of fresh.areas) {
    const before = old.get(area.name);
    if (!before) {
      diffs.push(`${area.name}: not in the committed scorecard`);
      continue;
    }
    const rules = new Map(before.rules.map((r) => [r.id, r]));
    for (const rule of area.rules) {
      const was = rules.get(rule.id);
      if (!was) diffs.push(`${area.name}/${rule.id}: not in the committed scorecard`);
      else if (rule.status !== 'skipped' && was.status !== 'skipped' && key(rule) !== key(was))
        diffs.push(
          `${area.name}/${rule.id}: committed ${was.value} (-${was.penalty}), now ${rule.value} (-${rule.penalty})`,
        );
    }
  }
  return diffs;
}
