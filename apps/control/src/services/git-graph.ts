import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { redactSecrets } from './redaction.js';

const run = promisify(execFile);
const SEP = '\x1f';

type GraphCommit = {
  sha: string;
  parents: string[];
  refs: string[];
  subject: string;
  author: string;
  at: number;
  lane: number;
  /** Lanes this row connects down to, one per parent. */
  edges: { to: number; parent: string }[];
};

/** Pure. Lays commits (newest first) out in lanes, the way `git log --graph` does. */
export function layoutGraph(commits: readonly Omit<GraphCommit, 'lane' | 'edges'>[]): {
  commits: GraphCommit[];
  lanes: number;
} {
  const lanes: (string | null)[] = [];
  let width = 0;
  const out: GraphCommit[] = [];
  for (const c of commits) {
    let lane = lanes.indexOf(c.sha);
    if (lane < 0) {
      lane = lanes.indexOf(null);
      if (lane < 0) lane = lanes.push(null) - 1;
    }
    // Every other lane waiting for this same commit merges into it here.
    for (let i = 0; i < lanes.length; i++) if (i !== lane && lanes[i] === c.sha) lanes[i] = null;
    const edges: GraphCommit['edges'] = [];
    c.parents.forEach((parent, index) => {
      let target = lanes.indexOf(parent);
      if (target < 0) {
        if (index === 0) target = lane;
        else {
          target = lanes.indexOf(null);
          if (target < 0 || target === lane) target = lanes.push(null) - 1;
        }
        lanes[target] = parent;
      }
      edges.push({ to: target, parent });
    });
    if (!c.parents.length) lanes[lane] = null;
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    width = Math.max(width, lane + 1, ...edges.map((e) => e.to + 1));
    out.push({ ...c, lane, edges });
  }
  return { commits: out, lanes: width };
}

/** Pure. `git log --format=%H%x1f%P%x1f%D%x1f%s%x1f%ct%x1f%an`. */
export function parseLog(text: string): Omit<GraphCommit, 'lane' | 'edges'>[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, parents, refs, subject, at, author] = line.split(SEP);
      return {
        sha: sha!,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        refs: refs ? refs.split(', ').filter(Boolean) : [],
        subject: redactSecrets(subject ?? '').slice(0, 160),
        author: redactSecrets(author ?? '').slice(0, 80),
        at: Number(at) * 1000,
      };
    });
}

export async function gitGraph(root: string, limit = 150) {
  const { stdout } = await run(
    'git',
    [
      '-C',
      root,
      'log',
      '--all',
      '--date-order',
      `-n${Math.min(400, Math.max(10, limit))}`,
      `--format=%H${SEP}%P${SEP}%D${SEP}%s${SEP}%ct${SEP}%an`,
    ],
    {
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' },
    },
  );
  return layoutGraph(parseLog(stdout));
}
