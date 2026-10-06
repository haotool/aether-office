#!/usr/bin/env node
// Helper steps called by history-apply.sh and history-verify.sh. Every step that rewrites anything first calls
// assertThrowawayClone, so it cannot run against the working checkout or any repository this kit did not create.
//   guard <clone>                       exit 0 only for a throwaway clone made by history-apply
//   guard-new <out> <source>            exit 0 only when <out> is a safe place for a new clone
//   plan-field <plan.json> <a.b.c>...   print fields of the plan, one per line
//   describe <plan.json> <source>       print what applying the plan will do (read-only)
//   mark <clone> <plan.json> <source>   write the throwaway marker into a fresh clone
//   verify <clone> <plan.json>         structural checks of a rewritten clone against its source
//   squash <clone> <plan.json>          strategy C and A: replace main by milestone commits (tree preserved)
//   filter-inputs <clone> <plan.json> <dir> [private-patterns]   write the git-filter-repo inputs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BUILT_IN_RULES,
  CLONE_MARKER,
  SUBJECT_MAX,
  assertFreshOutput,
  assertThrowawayClone,
  git,
  loadPrivatePatterns,
  readCommits,
  replaceRules,
  scanText,
  strippableBlobs,
} from './lib.mjs';

const readPlan = (file) => JSON.parse(readFileSync(file, 'utf8'));
const MAIN = 'refs/heads/main';

function commitTree(repo, { tree, parents, message, author, committer }) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: author.date,
    GIT_COMMITTER_NAME: committer.name,
    GIT_COMMITTER_EMAIL: committer.email,
    GIT_COMMITTER_DATE: committer.date,
  };
  const args = ['commit-tree', tree, ...parents.flatMap((p) => ['-p', p])];
  return git(repo, args, { env, input: message }).trim();
}

/**
 * Replaces `main` of a throwaway clone by one commit per milestone. Each milestone gets the exact tree of its last
 * original commit, so the tip tree is unchanged (checked). Upstream commits keep their authorship, dates and messages.
 */
export function squashHistory(repo, plan) {
  assertThrowawayClone(repo);
  const originals = new Map(readCommits(repo, plan.source.commit).map((c) => [c.hash, c]));
  const canonical = plan.identity.canonical;
  let previous = null;
  for (const m of plan.milestones) {
    const original = originals.get(m.tip);
    const tree = git(repo, ['rev-parse', `${m.tip}^{tree}`]).trim();
    if (m.kind === 'squash') {
      const who = { name: canonical.name, email: canonical.email };
      previous = commitTree(repo, {
        tree,
        parents: previous ? [previous] : [],
        message: m.message,
        author: { ...who, date: original.author.date },
        committer: { ...who, date: original.committer.date },
      });
      continue;
    }
    const parents = original.parents.map((p, i) => (i === 0 && previous ? previous : p));
    const unchanged = parents.every((p, i) => p === original.parents[i]);
    previous = unchanged
      ? m.tip
      : commitTree(repo, {
          tree,
          parents,
          message: m.message ?? original.message,
          author: original.author,
          committer: original.committer,
        });
  }
  const newTree = git(repo, ['rev-parse', `${previous}^{tree}`]).trim();
  if (newTree !== plan.source.tree)
    throw new Error(`squash changed the tip tree: ${newTree} != ${plan.source.tree}`);
  git(repo, ['update-ref', MAIN, previous]);
  return previous;
}

// Python bodies for filter-repo callbacks. Rules are loaded once per process; binary blobs are never rewritten.
const LOADER = `import json, os, re, sys, types
state = sys.modules.get('oss_state')
if state is None:
    state = types.ModuleType('oss_state')
    state.rules = [(re.compile(r['re'].encode()), r['rep'].encode(), r['literal']) for r in json.load(open(os.environ['OSS_RULES']))]
    state.messages = json.load(open(os.environ['OSS_MESSAGES']))
    sys.modules['oss_state'] = state
`;

const BLOB_CALLBACK = `${LOADER}if b'\\0' not in blob.data[:8000]:
    for rx, rep, literal in state.rules:
        blob.data = rx.sub((lambda m, rep=rep: rep) if literal else rep, blob.data)
`;

const COMMIT_CALLBACK = `${LOADER}new = state.messages.get(commit.original_id.decode())
if new is not None:
    commit.message = new.encode()
else:
    for rx, rep, literal in state.rules:
        commit.message = rx.sub((lambda m, rep=rep: rep) if literal else rep, commit.message)
`;

/** Writes everything \`git filter-repo\` needs; returns the counts the apply script prints. */
export function writeFilterInputs(repo, plan, dir, privateFile) {
  assertThrowawayClone(repo);
  mkdirSync(dir, { recursive: true });
  const blobs = strippableBlobs(repo, MAIN, plan.strip);
  const rules = replaceRules(loadPrivatePatterns(privateFile));
  const messages = Object.fromEntries(plan.messages.map((m) => [m.commit, m.message]));
  const files = {
    'paths.txt': `${plan.strip.paths.join('\n')}\n`,
    'strip-blobs.txt': blobs.map((b) => b.id).join('\n') + (blobs.length ? '\n' : ''),
    'mailmap.txt': plan.identity.mailmap.join('\n') + (plan.identity.mailmap.length ? '\n' : ''),
    'rules.json': JSON.stringify(rules, null, 2),
    'messages.json': JSON.stringify(messages, null, 2),
    'blob-callback.py': BLOB_CALLBACK,
    'commit-callback.py': COMMIT_CALLBACK,
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return {
    strippedBlobs: blobs.length,
    strippedBytes: blobs.reduce((n, b) => n + b.size, 0),
    privateRules: rules.length - 2,
    messages: plan.messages.length,
    mailmapLines: plan.identity.mailmap.length,
  };
}

const treeEntries = (repo, rev) =>
  new Map(
    git(repo, ['ls-tree', '-r', '-z', rev])
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const [meta = '', file = ''] = entry.split('\t');
        return [file, meta.split(' ')[2]];
      }),
  );

const matchesStrip = (file, paths) =>
  paths.some((p) =>
    p.startsWith('glob:')
      ? new RegExp(
          `^${p
            .slice(5)
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')}$`,
        ).test(file)
      : file.startsWith(p),
  );

/** Compares the tip of the clone with the source tip: identical, expectedly stripped or rewritten, or unexpected. */
export function compareTips(clone, source, plan) {
  const before = treeEntries(source, plan.source.commit);
  const after = treeEntries(clone, MAIN);
  const removed = [];
  const rewritten = [];
  const unexpected = [];
  let identical = 0;
  const rules = BUILT_IN_RULES.filter((r) => r.id === 'user-path');
  for (const [file, id] of before) {
    const other = after.get(file);
    if (other === id) identical += 1;
    else if (!other)
      (matchesStrip(file, plan.strip.paths) ? removed : unexpected).push(
        `${file}: missing in clone`,
      );
    else {
      const was = git(source, ['cat-file', 'blob', id], { encoding: 'latin1' });
      if (scanText(was, rules).length) rewritten.push(file);
      else unexpected.push(`${file}: content differs`);
    }
  }
  for (const file of after.keys()) if (!before.has(file)) unexpected.push(`${file}: new in clone`);
  return { identical, removed, rewritten, unexpected, total: before.size };
}

/** Structural checks of a rewritten clone against its source and plan. */
export function verifyStructure(clone, source, plan) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });
  const tips = compareTips(clone, source, plan);
  check(
    'tip tree matches the source tip',
    !tips.unexpected.length,
    `${tips.identical}/${tips.total} files byte-identical, ${tips.removed.length} stripped, ${tips.rewritten.length} rewritten by text rules${tips.unexpected.length ? `; unexpected: ${tips.unexpected.slice(0, 5).join('; ')}` : ''}`,
  );
  const after = readCommits(clone, MAIN);
  const before = readCommits(source, plan.source.commit);
  const maintainers = new Set(
    [...plan.identity.maintainerEmails, plan.identity.canonical.email].map((e) => e.toLowerCase()),
  );
  const isOwn = (c) => maintainers.has(c.author.email.toLowerCase());
  const outside = (commits) => commits.filter((c) => !isOwn(c));
  const key = (c) => `${c.author.name} <${c.author.email}> ${c.author.date} ${c.subject}`;
  const had = outside(before).map(key);
  const kept = new Set(outside(after).map(key));
  if (plan.strategy === 'A') {
    const names = [...new Set(outside(before).map((c) => c.author.name))];
    const text = after.map((c) => `${c.author.name}\n${c.message}`).join('\n');
    const lost = names.filter((n) => !text.includes(n));
    check(
      'upstream contributors are credited',
      !lost.length,
      lost.length ? `missing: ${lost.join(', ')}` : `${names.length} contributors named`,
    );
  } else {
    const missing = had.filter((k) => !kept.has(k));
    check(
      'upstream commits keep author, date and message',
      !missing.length,
      `${had.length - missing.length}/${had.length} intact${missing.length ? `; lost: ${missing.slice(0, 3).join('; ')}` : ''}`,
    );
  }
  const roots = after.filter((c) => !c.parents.length).length;
  const sourceRoots = before.filter((c) => !c.parents.length).length;
  check(
    'same number of root commits (no unrelated histories)',
    roots === sourceRoots,
    `${roots} vs ${sourceRoots}`,
  );
  const own = after.filter(isOwn);
  const long = own.filter((c) => c.subject.length > SUBJECT_MAX);
  check(
    `maintainer subjects are at most ${SUBJECT_MAX} characters`,
    !long.length,
    `${own.length} checked, ${long.length} too long`,
  );
  const stray = own.filter((c) => c.author.email !== plan.identity.canonical.email);
  check(
    'maintainer identity is canonical',
    !stray.length,
    stray.length ? `${stray.length} commits with another identity` : plan.identity.canonical.email,
  );
  check(
    'commit count',
    true,
    `${before.length} -> ${after.length} (${after.filter((c) => c.parents.length > 1).length} merges, was ${before.filter((c) => c.parents.length > 1).length})`,
  );
  return checks;
}

function field(object, dotted) {
  return dotted.split('.').reduce((value, key) => value?.[key], object);
}

function describe(plan, source, privateFile) {
  const blobs = strippableBlobs(source, plan.source.commit, plan.strip);
  const lines = [
    `strategy ${plan.strategy} on ${plan.source.ref} @ ${plan.source.commit.slice(0, 12)}`,
    `commits now ${plan.summary.commits}, expected after about ${plan.summary.expectedCommitsAfter}`,
    `milestones: ${plan.milestones.length} (${plan.summary.milestonesSquashed} squashed, ${plan.summary.milestonesKept} kept)`,
    `subjects rewritten: ${plan.messages.length}`,
    `strip paths: ${plan.strip.paths.join(', ')}`,
    `binary blobs stripped from full history: ${blobs.length} (${(blobs.reduce((n, b) => n + b.size, 0) / 1048576).toFixed(1)} MB)`,
    `mailmap lines: ${plan.identity.mailmap.length}; private patterns: ${loadPrivatePatterns(privateFile).length}`,
  ];
  return lines.join('\n');
}

function main(argv) {
  const [command, ...args] = argv;
  switch (command) {
    case 'guard':
      assertThrowawayClone(args[0]);
      return;
    case 'guard-new':
      assertFreshOutput(args[0], args[1]);
      return;
    case 'plan-field':
      for (const key of args.slice(1)) console.log(field(readPlan(args[0]), key));
      return;
    case 'describe':
      console.log(describe(readPlan(args[0]), args[1], args[2]));
      return;
    case 'mark': {
      const [clone, planFile, source] = args;
      const plan = readPlan(planFile);
      const dir = existsBare(clone) ? clone : path.join(clone, '.git');
      const info = {
        createdBy: 'history-apply',
        source: path.resolve(source),
        strategy: plan.strategy,
        commit: plan.source.commit,
      };
      writeFileSync(path.join(dir, CLONE_MARKER), `${JSON.stringify(info)}\n`);
      return;
    }
    case 'verify': {
      const [clone, planFile] = args;
      const info = assertThrowawayClone(clone);
      const checks = verifyStructure(clone, info.source, readPlan(planFile));
      for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.detail}`);
      if (checks.some((c) => !c.ok)) process.exitCode = 1;
      return;
    }
    case 'squash':
      console.log(squashHistory(args[0], readPlan(args[1])));
      return;
    case 'filter-inputs':
      console.log(JSON.stringify(writeFilterInputs(args[0], readPlan(args[1]), args[2], args[3])));
      return;
    default:
      throw new Error(`unknown command ${command ?? '(none)'}`);
  }
}

function existsBare(dir) {
  try {
    return git(dir, ['rev-parse', '--is-bare-repository']).trim() === 'true';
  } catch {
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
