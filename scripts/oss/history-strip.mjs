// What history cleanup removes: the default strip rules and the blobs of a revision's history that match them.
import path from 'node:path';
import { git } from './git-messages.mjs';

export const DEFAULT_STRIP = {
  // Removed from every commit. Root-anchored directories end in "/", globs match at any depth.
  paths: [
    'glob:*.blend',
    'glob:*.blend1',
    'evidence/',
    'test-results/',
    'playwright-report/',
    'glob:*.trace.zip',
  ],
  // Binary versions that are not part of the tip are dropped from history; the tip's versions always stay.
  blobExtensions: [
    'glb',
    'gltf',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'zip',
    'blend',
    'blend1',
    'mp4',
    'webm',
    'mov',
    'psd',
  ],
  minBytes: 200 * 1024,
  maxAnyBytes: 2 * 1024 * 1024,
};

/** Every blob reachable from `rev`: `{id, size, path}` (the first path git lists for it). */
export function historyBlobs(repo, rev) {
  const paths = new Map();
  for (const line of git(repo, ['rev-list', '--objects', rev]).split('\n')) {
    const space = line.indexOf(' ');
    if (space > 0) paths.set(line.slice(0, space), line.slice(space + 1));
    else if (line) paths.set(line, '');
  }
  const out = git(repo, ['cat-file', '--batch-check=%(objecttype) %(objectname) %(objectsize)'], {
    input: `${[...paths.keys()].join('\n')}\n`,
  });
  const blobs = [];
  for (const line of out.split('\n')) {
    const [type, id, size] = line.split(' ');
    if (type === 'blob' && id) blobs.push({ id, size: Number(size), path: paths.get(id) ?? '' });
  }
  return blobs;
}

export function tipBlobIds(repo, rev) {
  return new Set(
    git(repo, ['ls-tree', '-r', '-z', rev])
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.split(/[ \t]/)[2]),
  );
}

/** Blobs of `rev` history that cleanup strips: heavy binaries (or any huge file) that the tip does not use. */
export function strippableBlobs(repo, rev, strip = DEFAULT_STRIP) {
  const keep = tipBlobIds(repo, rev);
  const extensions = new Set(strip.blobExtensions);
  return historyBlobs(repo, rev).filter((b) => {
    const ext = path.extname(b.path).slice(1).toLowerCase();
    return (
      !keep.has(b.id) &&
      ((extensions.has(ext) && b.size >= strip.minBytes) || b.size >= strip.maxAnyBytes)
    );
  });
}
