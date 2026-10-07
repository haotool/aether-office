// Area 9: open-source readiness. The oss:check results (community files, hygiene, licences, personal data), REUSE
// coverage, the version having one source and not being a "-dev" build. The maintainer's open decisions are listed, not scored.
import { findingLocation, top } from '../lib.mjs';
import { info, rule } from '../model.mjs';
import { matching, runCommand } from '../repo.mjs';

const ASSESSMENT = 'docs/research/oss-risk-assessment.md';
const TEMPLATES = [
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/CODEOWNERS',
  '.github/dependabot.yml',
];
const PERSONAL = /^(?:fail|warn): \S+ (?:user-path|hostname|lan-address|private\S*|name|email)\b/;

/** The numbered items under the "blockers" heading of the assessment: the decisions only the maintainer can take. */
export function openDecisions(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^\*\*阻擋公開/.test(l));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\*\*/.test(line)) break;
    const m = /^(\d+)\.\s+(.*)$/.exec(line);
    if (m) out.push(`${ASSESSMENT}: ${m[1]}. ${m[2]}`.slice(0, 160));
  }
  return out;
}

export function versionFacts(repo) {
  const manifests = matching(repo, /^(package\.json|(apps|packages)\/[^/]+\/package\.json)$/).map(
    (file) => ({
      file,
      version: JSON.parse(repo.read(file)).version,
    }),
  );
  const root = manifests.find((m) => m.file === 'package.json')?.version ?? '';
  const mismatched = manifests
    .filter((m) => m.version !== root)
    .map((m) => `${m.file}: ${m.version} (root ${root})`);
  const copies = root
    ? matching(repo, /\.(ts|tsx|mjs|json)$/)
        .filter((f) => !/package\.json$|^tests\/|^docs\/|^scripts\/quality\/|\.lock$/.test(f))
        .filter((f) => repo.read(f).includes(root))
        .map((f) => `${f}: hard-codes ${root}`)
    : [];
  return { root, mismatched, copies };
}

export function oss(repo, { readiness = [] } = {}) {
  const lines = (id) => readiness.find((r) => r.id === id)?.lines ?? [];
  const content = lines('tree-content');
  const personal = content.filter((l) => PERSONAL.test(l));
  const home = personal.filter((l) => l.startsWith('fail:'));
  const notes = personal.filter((l) => l.startsWith('warn:'));
  const reuse = runCommand(process.execPath, ['scripts/oss/reuse-check.mjs'], { cwd: repo.root });
  const reuseLines =
    reuse.status === 0
      ? []
      : reuse.output
          .split('\n')
          .filter((l) => l.trim())
          .slice(0, 8);
  const missingTemplates = TEMPLATES.filter((f) => !repo.exists(f));
  if (!matching(repo, /^\.github\/ISSUE_TEMPLATE\//).length)
    missingTemplates.push('.github/ISSUE_TEMPLATE/');
  const { root, mismatched, copies } = versionFacts(repo);
  const licence = [
    ...lines('license-project'),
    ...lines('license-deps').filter((l) => /not|unknown|forbidden|missing/i.test(l)),
  ];
  const decisions = openDecisions(repo.read(ASSESSMENT));
  return [
    rule({
      id: 'community-files',
      label: 'Required community files missing',
      weight: 15,
      value: lines('community-files').length,
      full: 2,
      details: lines('community-files'),
    }),
    rule({
      id: 'templates',
      label: 'Issue, PR and ownership templates missing',
      weight: 5,
      value: missingTemplates.length + lines('community-recommended').length,
      full: 4,
      details: [...missingTemplates, ...lines('community-recommended')],
    }),
    rule({
      id: 'hygiene',
      label: 'Ignore rules and untracked files (gitignore, untracked, agent artifacts)',
      weight: 10,
      value:
        lines('gitignore').length + lines('untracked').length + lines('agent-artifacts').length,
      full: 3,
      details: [...lines('gitignore'), ...lines('untracked'), ...lines('agent-artifacts')],
    }),
    rule({
      id: 'licences',
      label: 'Licence problems (project, dependencies)',
      weight: 10,
      value: licence.length,
      full: 2,
      details: licence,
    }),
    rule({
      id: 'reuse',
      label: 'Files without REUSE coverage or notices out of date',
      weight: 10,
      value: reuseLines.length,
      full: 3,
      details: reuseLines,
    }),
    rule({
      id: 'home-paths',
      label: 'Personal paths or host names in tracked files',
      weight: 20,
      value: home.length,
      full: 3,
      details: top(home.map(findingLocation)),
    }),
    rule({
      id: 'doc-hostnames',
      label: 'Local host names and LAN addresses in documentation (confirm each is an example)',
      weight: 5,
      value: notes.length,
      full: 12,
      details: top(notes.map(findingLocation)),
    }),
    rule({
      id: 'version-source',
      label: 'Workspace versions differing from the root, or the version hard-coded elsewhere',
      weight: 5,
      value: mismatched.length + copies.length,
      full: 3,
      details: [...mismatched, ...copies],
    }),
    rule({
      id: 'dev-version',
      label: 'Version still carries a -dev suffix',
      weight: 5,
      value: /-dev\b/.test(root) ? 1 : 0,
      full: 1,
      details: /-dev\b/.test(root) ? [`package.json: ${root}`] : [],
    }),
    info(
      'open-decisions',
      'Maintainer decisions still open (docs/research/oss-risk-assessment.md, not scored)',
      decisions.length,
      decisions,
    ),
  ];
}
