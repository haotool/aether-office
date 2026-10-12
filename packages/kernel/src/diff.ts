type Hunk = { path: string; header: string; body: string };

const stripPrefix = (p: string) => p.replace(/^[ab]\//, '');

export function parseDiff(text: string): Hunk[] {
  const hunks: Hunk[] = [];
  let oldPath = '';
  let path = '';
  let current: { header: string; lines: string[] } | null = null;
  const flush = () => {
    if (current && path)
      hunks.push({ path, header: current.header, body: current.lines.join('\n') });
    current = null;
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      oldPath = path = '';
    } else if (!current && line.startsWith('--- ')) {
      oldPath = stripPrefix(line.slice(4));
    } else if (!current && line.startsWith('+++ ')) {
      const next = line.slice(4);
      path = next === '/dev/null' ? oldPath : stripPrefix(next);
    } else if (line.startsWith('@@ ')) {
      flush();
      current = { header: line, lines: [] };
    } else if (current && /^[ +\\-]/.test(line)) {
      current.lines.push(line);
    }
  }
  flush();
  return hunks;
}

type CommentStatus = 'current' | 'carried' | 'stale' | 'unknown';

/**
 * `carried`: head moved but the identical hunk still exists; `stale`: the hunk is gone or changed; `unknown`: no diff
 * for the new head is loaded, so nothing can be claimed.
 */
export function commentStatus(
  comment: { headSha: string; path: string; hunkHash: string },
  currentHead: string | null,
  currentHunks: readonly { path: string; hash: string }[] | null,
): CommentStatus {
  if (comment.headSha === currentHead) return 'current';
  if (!currentHunks) return 'unknown';
  return currentHunks.some((h) => h.path === comment.path && h.hash === comment.hunkHash)
    ? 'carried'
    : 'stale';
}
