#!/usr/bin/env node
// Writes a reviewable history-cleanup plan (JSON + Markdown); read-only. Usage: node scripts/oss/history-plan.mjs
// --strategy B|C|A [--repo .] [--ref <branch>] [--out <dir>] [--target 24] [--canonical-name <n>] [--canonical-email
// <e>] [--drop-trailers]. B keeps every commit (cleaned), C squashes the maintainer's commits into milestones and keeps
// upstream commits, A is C with the upstream merge flattened.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  DEFAULT_STRIP,
  SUBJECT_MAX,
  commitSizes,
  conventional,
  git,
  groupUnits,
  mergeSubject,
  readCommits,
  rewriteMessage,
  shortenSubject,
  stripTrailers,
  strippableBlobs,
  toplevel,
  upstreamSet,
  wrap,
} from './lib.mjs';
import { renderMarkdown } from './history-plan-render.mjs';

const PLAN_VERSION = 1;

function mailmapIdentity(repo, commit) {
  try {
    const text = git(repo, ['show', `${commit}:.mailmap`]);
    const line = text.split('\n').find((l) => /^[^#\s].*<[^>]+>/.test(l));
    const m = line && /^(.*?)\s*<([^>]+)>/.exec(line);
    return m ? { name: m[1].trim(), email: m[2] } : null;
  } catch {
    return null;
  }
}

const span = (commits) => {
  const days = commits.map((c) => c.day).sort();
  return [days[0] ?? '', days.at(-1) ?? ''];
};

const chronological = (units) =>
  units.flatMap((u) => [...u.own].reverse()).filter((c) => c.parents.length < 2);

function normalizeSubject(subject) {
  if (conventional(subject)) return subject;
  const m = /^merge:\s*(.*)$/i.exec(subject);
  return m ? `chore: ${m[1]}` : subject;
}

function unitsOf(repo, commit, byHash, upstream) {
  const chain = git(repo, ['rev-list', '--first-parent', '--reverse', commit])
    .split('\n')
    .filter(Boolean);
  let previous = null;
  return chain.map((hash) => {
    const tip = byHash.get(hash);
    const range = git(repo, ['rev-list', hash, ...(previous ? ['--not', previous] : [])])
      .split('\n')
      .filter(Boolean);
    previous = hash;
    const all = range.map((h) => byHash.get(h));
    const own = all.filter((c) => !upstream.has(c.hash));
    const imported = all.filter((c) => upstream.has(c.hash));
    const representative = own.find((c) => c.parents.length < 2) ?? tip;
    const parsed = conventional(representative.subject);
    const pinned = upstream.has(hash) || tip.parents.slice(1).some((p) => upstream.has(p));
    return {
      hash,
      tip,
      pinned,
      kind: upstream.has(hash) ? 'upstream' : pinned ? 'sync' : 'squash',
      own,
      imported,
      type: parsed?.type ?? 'chore',
      scope: parsed?.scope ?? '',
      subject: own.map((c) => c.subject).join(' \n '),
      day: tip.day,
    };
  });
}

const bullet = (text) =>
  `- ${wrap(text, SUBJECT_MAX - 2)
    .split('\n')
    .join('\n  ')}`;

function squashMessage(subject, unitsInGroup) {
  const commits = chronological(unitsInGroup);
  const [from, to] = span(commits);
  const range = from === to ? `on ${from}` : `between ${from} and ${to}`;
  return `${subject}\n\nSquashes ${commits.length} commits made ${range}:\n\n${commits.map((c) => bullet(c.subject)).join('\n')}\n`;
}

function syncMessage(unit, flatten, dropTrailers) {
  const subject = shortenSubject(normalizeSubject(unit.tip.subject));
  if (!flatten) {
    const message = rewriteMessage(subject, unit.tip.message);
    return dropTrailers ? stripTrailers(message) : message;
  }
  const authors = new Map();
  for (const c of unit.imported) authors.set(c.author.name, (authors.get(c.author.name) ?? 0) + 1);
  const people = [...authors]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([n, k]) => `${n} (${k})`);
  const list = [...unit.imported]
    .reverse()
    .map((c) => bullet(c.subject))
    .join('\n');
  return `${subject}\n\nImports ${unit.imported.length} upstream commits by ${people.join(', ')}:\n\n${list}\n`;
}

function leadSubject(members, type, sizes) {
  const commits = chronological(members);
  const ofType = commits.filter((c) => conventional(c.subject)?.type === type);
  const pool = ofType.length ? ofType : commits;
  const lead = pool.reduce(
    (best, c) => ((sizes.get(c.hash) ?? 0) > (sizes.get(best.hash) ?? 0) ? c : best),
    pool[0],
  );
  return conventional(lead.subject)?.rest ?? lead.subject;
}

function highlights(members, lead, sizes) {
  return chronological(members)
    .filter((c) => (conventional(c.subject)?.rest ?? c.subject) !== lead)
    .sort(
      (a, b) => (sizes.get(b.hash) ?? 0) - (sizes.get(a.hash) ?? 0) || (a.hash < b.hash ? -1 : 1),
    )
    .slice(0, 3)
    .map((c) => shortenSubject(`x: ${conventional(c.subject)?.rest ?? c.subject}`, 54).slice(3));
}

function milestonesFor(units, strategy, target, sizes, dropTrailers) {
  const flatten = strategy === 'A';
  const groups = groupUnits(units, { target });
  const seen = new Map();
  return groups.map((group, index) => {
    const members = group.indexes.map((i) => units[i]);
    const tip = members.at(-1).hash;
    const base = {
      id: index + 1,
      tip,
      commits: members.flatMap((u) => [...u.own].reverse().map((c) => c.hash)),
    };
    if (group.pinned) {
      const unit = members[0];
      if (unit.kind === 'upstream')
        return {
          ...base,
          kind: 'upstream',
          subject: unit.tip.subject,
          commits: [unit.hash],
          first: unit.tip.day,
          last: unit.tip.day,
        };
      const message = syncMessage(unit, flatten, dropTrailers);
      return {
        ...base,
        kind: flatten ? 'squash' : 'keep',
        subject: message.split('\n')[0],
        message,
        first: unit.tip.day,
        last: unit.tip.day,
        imported: unit.imported.length,
      };
    }
    const lead = leadSubject(members, group.type, sizes);
    let subject = shortenSubject(`${group.type}: ${lead}`);
    const count = (seen.get(subject) ?? 0) + 1;
    seen.set(subject, count);
    if (count > 1) subject = `${subject} (part ${count})`;
    const [first, last] = span(chronological(members));
    const more = highlights(members, lead, sizes);
    return {
      ...base,
      kind: 'squash',
      subject,
      highlights: more,
      message: squashMessage(subject, members),
      first,
      last,
    };
  });
}

function messagePlan(commits, upstream, byHash, dropTrailers) {
  const out = [];
  for (const c of [...commits].reverse()) {
    if (upstream.has(c.hash)) continue;
    let subject = c.subject;
    if (c.parents.length > 1 && /^Merge /.test(subject)) {
      const side = byHash.get(c.parents[1]);
      subject = mergeSubject(side?.subject ?? subject);
    } else subject = shortenSubject(normalizeSubject(subject));
    const rewritten = rewriteMessage(subject, c.message);
    const message = dropTrailers ? stripTrailers(rewritten) : rewritten;
    if (subject !== c.subject || message !== rewritten)
      out.push({ commit: c.hash, from: c.subject, subject, message });
  }
  return out;
}

export function buildPlan(repo, options = {}) {
  const strategy = options.strategy ?? 'C';
  if (!['A', 'B', 'C'].includes(strategy)) throw new Error(`unknown strategy ${strategy}`);
  const ref = options.ref ?? git(repo, ['symbolic-ref', '--short', '-q', 'HEAD']).trim();
  if (!ref) throw new Error('detached HEAD: pass --ref <branch>');
  const commit = git(repo, ['rev-parse', '--verify', `refs/heads/${ref}^{commit}`]).trim();
  const commits = readCommits(repo, commit);
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const head = byHash.get(commit);
  const maintainerEmails = options.maintainerEmails?.length
    ? options.maintainerEmails
    : [head.author.email];
  const upstream = upstreamSet(commits, maintainerEmails);
  const fromMailmap = mailmapIdentity(repo, commit);
  const canonical = {
    name: options.canonicalName ?? fromMailmap?.name ?? head.author.name,
    email: options.canonicalEmail ?? fromMailmap?.email ?? head.author.email,
  };
  const identities = new Map();
  for (const c of commits)
    for (const who of [c.author, c.committer])
      if (maintainerEmails.map((e) => e.toLowerCase()).includes(who.email.toLowerCase()))
        identities.set(`${who.name} <${who.email}>`, who);
  const mailmap = [...identities.values()]
    .filter((who) => who.name !== canonical.name || who.email !== canonical.email)
    .map((who) => `${canonical.name} <${canonical.email}> ${who.name} <${who.email}>`)
    .sort();
  const authors = new Map();
  for (const c of commits.filter((x) => upstream.has(x.hash))) {
    const key = `${c.author.name} <${c.author.email}>`;
    authors.set(key, (authors.get(key) ?? 0) + 1);
  }
  const strip = { ...DEFAULT_STRIP, keepTipVersions: true };
  const blobs = strippableBlobs(repo, commit, strip);
  const target = options.target ?? 24;
  const units = unitsOf(repo, commit, byHash, upstream);
  const milestones =
    strategy === 'B'
      ? []
      : milestonesFor(
          units,
          strategy,
          target,
          commitSizes(repo, commit),
          Boolean(options.dropTrailers),
        );
  const messages =
    strategy === 'B' ? messagePlan(commits, upstream, byHash, Boolean(options.dropTrailers)) : [];
  const merges = commits.filter((c) => c.parents.length > 1);
  const own = commits.filter((c) => !upstream.has(c.hash));
  const squashed = milestones.filter((m) => m.kind === 'squash').length;
  const kept = milestones.filter((m) => m.kind !== 'squash').length;
  const upstreamKept = milestones.filter((m) => m.kind === 'upstream').length;
  const expectedCommits =
    strategy === 'B'
      ? commits.length
      : (strategy === 'C' ? upstream.size : upstreamKept) + milestones.length - upstreamKept;
  return {
    version: PLAN_VERSION,
    strategy,
    source: {
      ref,
      commit,
      tree: git(repo, ['rev-parse', `${commit}^{tree}`]).trim(),
      subject: head.subject,
    },
    options: { target, dropTrailers: Boolean(options.dropTrailers) },
    identity: { canonical, maintainerEmails, mailmap },
    upstream: {
      commits: upstream.size,
      authors: [...authors]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([who, n]) => ({ who, commits: n })),
      note: 'Commits by non-maintainer authors and their ancestry. Authorship and dates are never rewritten; messages only lose the lines an AI tool added (session links, AI co-author trailers) when trailers are dropped.',
    },
    strip: {
      ...strip,
      estimate: { blobs: blobs.length, bytes: blobs.reduce((n, b) => n + b.size, 0) },
    },
    privatePatterns: {
      file: '.oss-private-patterns',
      note: 'Read at apply time from the file given to history-apply; never stored in this plan.',
    },
    messages,
    milestones,
    summary: {
      commits: commits.length,
      upstreamCommits: upstream.size,
      maintainerCommits: own.length,
      merges: merges.length,
      subjectsOver72: own.filter((c) => c.subject.length > SUBJECT_MAX).length,
      milestonesSquashed: squashed,
      milestonesKept: kept,
      expectedCommitsAfter: expectedCommits,
    },
  };
}
function main() {
  const { values } = parseArgs({
    options: {
      strategy: { type: 'string', default: 'C' },
      repo: { type: 'string', default: '.' },
      ref: { type: 'string' },
      out: { type: 'string', default: 'oss-plan' },
      target: { type: 'string', default: '24' },
      'maintainer-email': { type: 'string', multiple: true },
      'canonical-name': { type: 'string' },
      'canonical-email': { type: 'string' },
      'drop-trailers': { type: 'boolean', default: false },
    },
  });
  const repo = toplevel(values.repo);
  if (!repo) throw new Error(`${values.repo} is not a git repository`);
  const plan = buildPlan(repo, {
    strategy: values.strategy.toUpperCase(),
    ref: values.ref,
    target: Number(values.target),
    maintainerEmails: values['maintainer-email'],
    canonicalName: values['canonical-name'],
    canonicalEmail: values['canonical-email'],
    dropTrailers: values['drop-trailers'],
  });
  const out = path.resolve(values.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(path.join(out, 'plan.md'), renderMarkdown(plan));
  console.log(
    `strategy ${plan.strategy}: ${plan.summary.commits} commits -> about ${plan.summary.expectedCommitsAfter}`,
  );
  console.log(`wrote ${path.join(out, 'plan.json')} and ${path.join(out, 'plan.md')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
