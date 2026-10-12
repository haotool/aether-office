import { SUBJECT_MAX } from './lib.mjs';

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

export function renderMarkdown(plan) {
  const s = plan.summary;
  const lines = [
    `# History cleanup plan: strategy ${plan.strategy}`,
    '',
    `Source: \`${plan.source.ref}\` at \`${plan.source.commit.slice(0, 12)}\` (tree \`${plan.source.tree.slice(0, 12)}\`).`,
    'Review this file and `plan.json`; edit the milestone subjects or bodies in `plan.json` before applying.',
    '',
    '| | |',
    '| --- | --- |',
    `| Commits now | ${s.commits} (${s.upstreamCommits} upstream, ${s.maintainerCommits} maintainer, ${s.merges} merges) |`,
    `| Commits after | about ${s.expectedCommitsAfter} |`,
    `| Subjects over ${SUBJECT_MAX} characters (maintainer) | ${s.subjectsOver72} |`,
    `| Binary versions stripped (upper bound) | ${plan.strip.estimate.blobs} blobs, ${mb(plan.strip.estimate.bytes)} |`,
    `| Canonical identity | ${plan.identity.canonical.name} <${plan.identity.canonical.email}> |`,
    '',
    '## Strip from every commit',
    '',
    ...plan.strip.paths.map((p) => `- \`${p}\``),
    `- binary versions (${plan.strip.blobExtensions.join(', ')}; at least ${Math.round(plan.strip.minBytes / 1024)} KB) and any file over ${mb(plan.strip.maxAnyBytes)} that the tip does not use`,
    '',
    '## Rewrite',
    '',
    '- text: home directories (`/Users/<name>`, `C:\\Users\\<name>`) become `/Users/dev`; strings from `.oss-private-patterns` get their replacement',
    plan.identity.mailmap.length
      ? `- mailmap:\n${plan.identity.mailmap.map((l) => `  - \`${l}\``).join('\n')}`
      : '- mailmap: no identity changes',
    '',
    '## Upstream contributors (kept as they are)',
    '',
    ...plan.upstream.authors.map((a) => `- ${a.who}: ${a.commits}`),
  ];
  if (plan.milestones.length) {
    lines.push(
      '',
      '## Milestones',
      '',
      '| # | Kind | Dates | Commits | Subject | Also in it |',
      '| --: | --- | --- | --: | --- | --- |',
    );
    for (const m of plan.milestones)
      lines.push(
        `| ${m.id} | ${m.kind} | ${m.first}${m.last !== m.first ? ` to ${m.last}` : ''} | ${m.commits.length} | ${m.subject} | ${(m.highlights ?? []).join('; ')} |`,
      );
  }
  if (plan.messages.length) {
    lines.push(
      '',
      `## Subjects rewritten (${plan.messages.length})`,
      '',
      '| Before | After |',
      '| --- | --- |',
    );
    for (const m of plan.messages)
      lines.push(
        `| ${m.from.slice(0, 90).replace(/\|/g, '/')}${m.from.length > 90 ? '...' : ''} | ${m.subject} |`,
      );
  }
  return `${lines.join('\n')}\n`;
}
