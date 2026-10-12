import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  opendirSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

export type Observation = {
  sourceId: string;
  sessionId: string;
  kind: 'message' | 'tool';
  role: 'user' | 'assistant';
  text: string;
};

/** The one approved file below an approved root, resolved: anything that escapes the grant is refused. */
export function approvedSource(approvedRoot: string, relativeFile: string, projectRoot: string) {
  if (!isAbsolute(approvedRoot) || !isAbsolute(projectRoot) || isAbsolute(relativeFile))
    throw new Error('OBSERVATION_PATH_NOT_GRANTED');
  const root = realpathSync(approvedRoot),
    file = resolve(root, relativeFile);
  if (!inside(root, file)) throw new Error('OBSERVATION_PATH_NOT_GRANTED');
  return { root, file, projectRoot: realpathSync(projectRoot) };
}

export function openSource(file: string) {
  const blocked = () =>
    Object.assign(new Error('OBSERVATION_PATH_CHANGED'), { code: 'OBSERVATION_PATH_CHANGED' });
  if (realpathSync(file) !== file) throw blocked();
  const before = lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink()) throw blocked();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd),
      after = lstatSync(file);
    if (
      !stat.isFile() ||
      stat.dev !== before.dev ||
      stat.ino !== before.ino ||
      stat.dev !== after.dev ||
      stat.ino !== after.ino ||
      realpathSync(file) !== file
    )
      throw blocked();
    return { fd, stat };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

export function pathFailureStatus(error: unknown): 'missing' | 'blocked_path' | null {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return 'missing';
  return ['ELOOP', 'OBSERVATION_PATH_CHANGED'].includes(code ?? '') ? 'blocked_path' : null;
}

/** Discovery is bounded and never follows symlinks. Only explicitly configured roots are scanned. */
export function discoverObservationFiles(approvedRoot: string): string[] {
  if (!isAbsolute(approvedRoot)) throw new Error('OBSERVATION_ABSOLUTE_ROOT_REQUIRED');
  const root = realpathSync(approvedRoot);
  const files: string[] = [];
  let inspected = 0;
  const walk = (directory: string, depth: number) => {
    if (realpathSync(directory) !== directory || lstatSync(directory).isSymbolicLink())
      throw new Error('OBSERVATION_PATH_CHANGED');
    const handle = opendirSync(directory);
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
        if (++inspected > 1000) throw new Error('OBSERVATION_DISCOVERY_LIMIT');
        if (entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory() && depth < 6) walk(path, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(relative(root, path));
      }
    } finally {
      handle.closeSync();
    }
  };
  walk(root, 0);
  return files.sort();
}
