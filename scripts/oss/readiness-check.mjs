#!/usr/bin/env node
// Publishing-readiness check: scans the current tree and, with --history, the whole history of HEAD for things that must
// not be published (personal paths, private strings, secrets, huge or path-embedding binaries, missing community files,
// license problems, broken documentation links, untidy commit messages). No network. Exit 1 on any failure.
//
//   node scripts/oss/readiness-check.mjs [--root <repo>] [--history] [--private-patterns <file>]
//        [--maintainer-email <e>]... [--max-history-mb 5] [--skip-gitleaks] [--gitleaks-config <file>] [--strict] [--json]
//
// Private strings (names, e-mail addresses, host names) live in the gitignored `.oss-private-patterns` (see
// `.oss-private-patterns.example`); only generic patterns are built in.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadPrivatePatterns, toplevel } from './lib.mjs';
import { DETAIL_LIMIT } from './readiness-config.mjs';
import { add, results } from './readiness-results.mjs';
import {
  checkCommunityFiles,
  checkSecrets,
  checkTrackedHygiene,
  checkTreeContent,
  largeTracked,
  listTracked,
} from './readiness-tree.mjs';
import { checkDocLinks, checkLicenses } from './readiness-licenses.mjs';
import {
  checkAgentArtifactsInTree,
  checkCommits,
  checkHistoryContent,
  checkHistoryPaths,
} from './readiness-history.mjs';

const ICON = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };

function print(json) {
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const r of results) {
    console.log(`[${ICON[r.status]}] ${r.title}`);
    for (const line of r.lines.slice(0, DETAIL_LIMIT)) console.log(`       ${line}`);
    if (r.lines.length > DETAIL_LIMIT)
      console.log(`       ... ${r.lines.length - DETAIL_LIMIT} more (use --json for all)`);
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(
    `\n${count('pass')} passed, ${count('warn')} warnings, ${count('fail')} failed, ${count('skip')} skipped`,
  );
}

export async function run(options) {
  results.length = 0;
  const root = toplevel(options.root);
  if (!root) throw new Error(`${options.root} is not a git repository`);
  const privateFile = options.privatePatterns ?? path.join(root, '.oss-private-patterns');
  const rules = loadPrivatePatterns(privateFile);
  add('private-patterns', 'Private patterns file', rules.length ? 'pass' : 'warn', [
    rules.length
      ? `${rules.length} private pattern(s) loaded`
      : `no patterns: create ${path.basename(privateFile)} (see .oss-private-patterns.example) so names, e-mails and host names are checked`,
  ]);
  const files = listTracked(root);
  checkCommunityFiles(root, files);
  checkTrackedHygiene(root, files);
  checkAgentArtifactsInTree(files);
  const hasGitleaks = checkSecrets(
    root,
    options.history,
    options.skipGitleaks,
    options.gitleaksConfig,
  );
  checkTreeContent(root, files, rules, hasGitleaks);
  largeTracked(root, files, 1);
  checkLicenses(root, files);
  checkDocLinks(root, files);
  if (options.history) {
    await checkHistoryContent(root, rules, options.maxHistoryMb, hasGitleaks);
    checkHistoryPaths(root);
    checkCommits(root, options.maintainerEmails, rules);
  }
  return results;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      root: { type: 'string', default: '.' },
      history: { type: 'boolean', default: false },
      'private-patterns': { type: 'string' },
      'maintainer-email': { type: 'string', multiple: true },
      'max-history-mb': { type: 'string', default: '5' },
      'skip-gitleaks': { type: 'boolean', default: false },
      'gitleaks-config': { type: 'string' },
      strict: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });
  await run({
    root: values.root,
    history: values.history,
    privatePatterns: values['private-patterns'],
    maintainerEmails: values['maintainer-email'] ?? [],
    maxHistoryMb: Number(values['max-history-mb']),
    skipGitleaks: values['skip-gitleaks'],
    gitleaksConfig: values['gitleaks-config'],
  });
  print(values.json);
  const failed = results.some((r) => r.status === 'fail' || (values.strict && r.status === 'warn'));
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
