// History checks of the publishing-readiness check (--history): blobs, paths, commit messages, agent artifacts.
import { spawn } from 'node:child_process';
import {
  BUILT_IN_RULES,
  SUBJECT_MAX,
  TOKEN_RULES,
  binaryText,
  conventional,
  git,
  historyBlobs,
  isBinaryPath,
  looksBinary,
  readCommits,
  scanText,
  upstreamSet,
} from './lib.mjs';
import { FORBIDDEN_TRACKED, MB, SELF } from './readiness-config.mjs';
import { add, worst } from './readiness-results.mjs';
import { report } from './readiness-tree.mjs';

// ---------------------------------------------------------------------------------------------------------------
// History

async function streamBlobs(repo, ids, onBlob) {
  const child = spawn('git', ['-C', repo, 'cat-file', '--batch'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  child.stdin.end(`${ids.join('\n')}\n`);
  let chunks = [];
  let length = 0;
  let pending = null;
  const take = (n) => {
    const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    chunks = n < all.length ? [all.subarray(n)] : [];
    length = all.length - n;
    return all.subarray(0, n);
  };
  for await (const chunk of child.stdout) {
    chunks.push(chunk);
    length += chunk.length;
    for (;;) {
      if (!pending) {
        const head =
          chunks.length > 1 && chunks[0].indexOf(10) < 0 ? Buffer.concat(chunks) : chunks[0];
        const nl = head?.indexOf(10) ?? -1;
        if (nl < 0) break;
        if (head !== chunks[0]) chunks = [head];
        const [id = '', , size = '0'] = take(nl + 1)
          .toString()
          .trim()
          .split(' ');
        pending = { id, size: Number(size) };
      }
      if (length < pending.size + 1) break;
      onBlob(pending.id, take(pending.size + 1).subarray(0, pending.size));
      pending = null;
    }
  }
}

export async function checkHistoryContent(root, rules, maxMb, hasGitleaks) {
  const blobs = historyBlobs(root, 'HEAD');
  const ids = blobs.filter((b) => b.size <= 64 * MB).map((b) => b.id);
  const byId = new Map(blobs.map((b) => [b.id, b]));
  const textRules = [
    ...BUILT_IN_RULES.filter((r) => !r.docsOnly),
    ...rules,
    ...(hasGitleaks ? [] : TOKEN_RULES),
  ];
  const binaryRules = textRules.filter((r) => r.id === 'user-path' || r.private);
  const hits = new Map();
  await streamBlobs(root, ids, (id, buffer) => {
    const { path: file = '' } = byId.get(id) ?? {};
    if (SELF.test(file)) return;
    const binary = isBinaryPath(file) || looksBinary(buffer);
    const findings = scanText(
      binary ? binaryText(buffer) : buffer.toString('utf8'),
      binary ? binaryRules : textRules,
    );
    for (const f of findings) {
      const key = `${binary ? 'binary' : 'text'} ${f.severity} ${file} ${f.rule}`;
      const entry = hits.get(key) ?? { ...f, file, binary, blobs: 0 };
      entry.blobs += 1;
      hits.set(key, entry);
    }
  });
  const rows = [...hits.values()];
  const fmt = (h) => ({
    ...h,
    line: 0,
    sample: `${h.sample} (${h.blobs} version${h.blobs === 1 ? '' : 's'})`,
  });
  report(
    'history-content',
    'History: personal paths, private strings, tokens in text files',
    rows.filter((h) => !h.binary).map(fmt),
  );
  report(
    'history-binary',
    'History: binary files embed no personal paths or private strings',
    rows.filter((h) => h.binary).map(fmt),
  );
  const large = blobs.filter((b) => b.size > maxMb * MB).sort((a, b) => b.size - a.size);
  const bytes = large.reduce((n, b) => n + b.size, 0);
  add(
    'large-history',
    `Blobs over ${maxMb} MB anywhere in history`,
    worst(large),
    large.length
      ? [
          `${large.length} blobs, ${(bytes / MB).toFixed(0)} MB in total; largest:`,
          ...large
            .slice(0, 10)
            .map(
              (b) => `${(b.size / MB).toFixed(2).padStart(6)} MB  ${b.id.slice(0, 10)}  ${b.path}`,
            ),
        ]
      : [],
  );
  const pack = /size-pack: (.+)/.exec(git(root, ['count-objects', '-vH']))?.[1] ?? '?';
  add('history-size', 'Repository pack size', 'pass', [
    `size-pack ${pack} (run \`git gc --aggressive\` for a fair figure)`,
  ]);
}

export function checkHistoryPaths(root) {
  const seen = new Set(
    git(root, ['log', '--format=', '--name-only', 'HEAD']).split('\n').filter(Boolean),
  );
  const hits = [];
  for (const file of seen)
    for (const [re, why] of FORBIDDEN_TRACKED)
      if (re.test(file) && !/\.blend1?$/.test(file)) hits.push(`${file}: ${why}`);
  const blend = [...seen].filter((f) => /\.blend1?$/.test(f));
  if (blend.length) hits.push(`${blend.length} Blender file path(s) in history, e.g. ${blend[0]}`);
  add(
    'history-paths',
    'History: no local data, agent files, key material or Blender files ever committed',
    worst(hits),
    hits.slice(0, 40),
  );
}

export function checkCommits(root, maintainerEmails, rules) {
  const commits = readCommits(root, 'HEAD');
  const emails = maintainerEmails.length ? maintainerEmails : [commits[0]?.author.email ?? ''];
  const upstream = upstreamSet(commits, emails);
  const own = commits.filter((c) => !upstream.has(c.hash));
  const long = own.filter((c) => c.subject.length > SUBJECT_MAX);
  const untyped = own.filter((c) => !conventional(c.subject));
  const trailers = own.filter((c) =>
    /^(Co-Authored-By|Signed-off-by|Claude-Session|Generated-by|Reviewed-by):/im.test(c.message),
  );
  const merges = own.filter((c) => c.parents.length > 1);
  const sample = (list) =>
    list.slice(0, 5).map((c) => `${c.hash.slice(0, 8)} ${c.subject.slice(0, 80)}`);
  add(
    'commit-length',
    `Maintainer commit subjects are at most ${SUBJECT_MAX} characters (${own.length} checked, ${upstream.size} upstream skipped)`,
    worst(long, 'warn'),
    [
      long.length
        ? `${long.length} too long, longest ${Math.max(...long.map((c) => c.subject.length))}`
        : '',
      ...sample(long),
    ].filter(Boolean),
  );
  add(
    'commit-type',
    'Maintainer commit subjects start with a conventional type',
    worst(untyped, 'warn'),
    [
      untyped.length ? `${untyped.length} without a type (${merges.length} merge commits)` : '',
      ...sample(untyped),
    ].filter(Boolean),
  );
  add(
    'commit-trailers',
    'No attribution trailers (Co-Authored-By, Signed-off-by, session links) in maintainer commits',
    worst(trailers, 'warn'),
    sample(trailers),
  );
  const authors = new Map();
  for (const c of commits) {
    const key = `${c.author.name} <${c.author.email}>`;
    authors.set(key, (authors.get(key) ?? 0) + 1);
  }
  add(
    'authors',
    `Authors (${authors.size}); check that each address is meant to be public`,
    'pass',
    [...authors].sort((a, b) => b[1] - a[1]).map(([who, n]) => `${String(n).padStart(4)}  ${who}`),
  );
  const identity = commits
    .flatMap((c) => [
      `${c.author.name} ${c.author.email}`,
      `${c.committer.name} ${c.committer.email}`,
      c.message,
    ])
    .join('\n');
  const privateHits = scanText(
    identity,
    rules.filter((r) => r.private),
  );
  add(
    'history-identity',
    'Commit authors and messages contain no private patterns',
    worst(privateHits),
    privateHits.slice(0, 10).map((h) => `${h.rule} (line ${h.line})`),
  );
}

export function checkAgentArtifactsInTree(files) {
  const hits = files.filter((f) =>
    /^(\.claude|\.cursor|\.codex|\.omc)\/|(^|\/)CLAUDE\.local\.md$|(^|\/)\.superclaude/.test(f),
  );
  add(
    'agent-artifacts',
    'No agent worktrees or local agent settings tracked',
    worst(hits),
    hits.slice(0, 20),
  );
}
