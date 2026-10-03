import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  opendirSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { getSessionMessages, type SessionStoreEntry } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};
function approvedSource(approvedRoot: string, relativeFile: string, projectRoot: string) {
  if (!isAbsolute(approvedRoot) || !isAbsolute(projectRoot) || isAbsolute(relativeFile))
    throw new Error('OBSERVATION_PATH_NOT_GRANTED');
  const root = realpathSync(approvedRoot),
    file = resolve(root, relativeFile);
  if (!inside(root, file)) throw new Error('OBSERVATION_PATH_NOT_GRANTED');
  return { root, file, projectRoot: realpathSync(projectRoot) };
}
function openSource(file: string) {
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
// Rollout versions whose line format was checked against real sessions. Anything else is reported as
// unsupported_schema instead of being parsed on a guess.
export const SUPPORTED_ROLLOUT_VERSIONS = ['0.159.2', '0.160.0'] as const;
// Record types seen in real 0.159.2 and 0.160.0 rollouts that carry no conversation content.
const NON_CONVERSATION_RECORDS = [
  'turn_context',
  'event_msg',
  'compacted',
  'world_state',
  'token_usage_record',
  'inter_agent_communication_metadata',
];
const metaSchema = z.object({
  id: z.string().min(1).max(200),
  cwd: z.string().refine(isAbsolute),
  cli_version: z.enum(SUPPORTED_ROLLOUT_VERSIONS),
});
const checkpointSchema = z
  .object({
    identity: z.string(),
    offset: z.number().int().nonnegative(),
    prefixLength: z.number().int().min(0).max(256),
    prefixHash: z.string(),
    meta: metaSchema.nullable(),
    failure: z.enum(['unsupported_schema', 'limit_exceeded']).nullable(),
  })
  .strict();
export type ObserverCheckpoint = z.infer<typeof checkpointSchema>;
export type Observation = {
  sourceId: string;
  sessionId: string;
  kind: 'message' | 'tool';
  role: 'user' | 'assistant';
  text: string;
};
export type ObservationRead = {
  status:
    | 'observed'
    | 'unchanged'
    | 'partial'
    | 'missing'
    | 'blocked_path'
    | 'unsupported_schema'
    | 'limit_exceeded'
    | 'read_error';
  records: Observation[];
  checkpoint: ObserverCheckpoint | null;
  rotated: boolean;
};
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
/** Read-only Codex rollout decoder. It never discovers a default home directory. */
export class CodexObserver {
  readonly file: string;
  readonly root: string;
  readonly projectRoot: string;
  constructor(approvedRoot: string, relativeFile: string, projectRoot: string) {
    const source = approvedSource(approvedRoot, relativeFile, projectRoot);
    this.root = source.root;
    this.file = source.file;
    this.projectRoot = source.projectRoot;
  }
  read(previous: ObserverCheckpoint | null = null): ObservationRead {
    let checkpoint = previous ? checkpointSchema.parse(previous) : null;
    const records: Observation[] = [];
    let fd: number | undefined;
    let rotated = false;
    const result = (status: ObservationRead['status']): ObservationRead => ({
      status,
      records,
      checkpoint,
      rotated,
    });
    try {
      const opened = openSource(this.file);
      fd = opened.fd;
      const stat = opened.stat;
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      const prefix = Buffer.alloc(Math.min(256, stat.size));
      readSync(fd, prefix, 0, prefix.length, 0);
      if (
        checkpoint &&
        (checkpoint.identity !== identity ||
          stat.size < checkpoint.offset ||
          prefix.length < checkpoint.prefixLength ||
          hash(prefix.subarray(0, checkpoint.prefixLength)) !== checkpoint.prefixHash)
      ) {
        checkpoint = null;
        rotated = true;
      }
      checkpoint = checkpoint
        ? { ...checkpoint }
        : { identity, offset: 0, prefixLength: 0, prefixHash: hash(''), meta: null, failure: null };
      checkpoint.prefixLength = prefix.length;
      checkpoint.prefixHash = hash(prefix);
      if (checkpoint.failure) return result(checkpoint.failure);
      const startOffset = checkpoint.offset;
      const buffer = Buffer.alloc(Math.min(256 * 1024, stat.size - startOffset));
      const count = readSync(fd, buffer, 0, buffer.length, startOffset);
      let position = 0,
        lines = 0;
      while (position < count && lines++ < 128) {
        const newline = buffer.subarray(0, count).indexOf(10, position);
        if (newline < 0) {
          if (count - position > 65536) {
            checkpoint.failure = 'limit_exceeded';
            return result('limit_exceeded');
          }
          return result(
            startOffset + count >= stat.size
              ? 'partial'
              : records.length
                ? 'observed'
                : 'unchanged',
          );
        }
        if (newline - position > 65536) {
          checkpoint.failure = 'limit_exceeded';
          return result('limit_exceeded');
        }
        const offset = startOffset + position;
        const line = buffer.subarray(position, newline);
        position = newline + 1;
        checkpoint.offset = startOffset + position;
        if (!line.length || (line.length === 1 && line[0] === 13)) continue;
        let parsed: Record<string, unknown>;
        try {
          parsed = z
            .record(z.string(), z.unknown())
            .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)));
        } catch {
          checkpoint.failure = 'unsupported_schema';
          return result('unsupported_schema');
        }
        if (parsed['type'] === 'session_meta') {
          const meta = metaSchema.safeParse(parsed['payload']);
          if (
            !meta.success ||
            resolve(meta.data.cwd) !== this.projectRoot ||
            (checkpoint.meta && checkpoint.meta.id !== meta.data.id)
          ) {
            checkpoint.failure = 'unsupported_schema';
            return result('unsupported_schema');
          }
          checkpoint.meta = meta.data;
          continue;
        }
        if (!checkpoint.meta) {
          checkpoint.failure = 'unsupported_schema';
          return result('unsupported_schema');
        }
        if (NON_CONVERSATION_RECORDS.includes(String(parsed['type']))) continue;
        if (parsed['type'] !== 'response_item') {
          checkpoint.failure = 'unsupported_schema';
          return result('unsupported_schema');
        }
        const item = z.record(z.string(), z.unknown()).safeParse(parsed['payload']);
        if (!item.success) {
          checkpoint.failure = 'unsupported_schema';
          return result('unsupported_schema');
        }
        const p = item.data;
        if (
          p['type'] === 'reasoning' ||
          (p['channel'] != null && !['final', 'commentary'].includes(String(p['channel'])))
        )
          continue;
        const base = {
          sourceId: hash(`${identity}:${offset}:${hash(line)}`),
          sessionId: checkpoint.meta.id,
        };
        if (p['type'] === 'message') {
          if (!['user', 'assistant'].includes(String(p['role']))) continue;
          const content = z.array(z.record(z.string(), z.unknown())).safeParse(p['content']);
          if (!content.success) {
            checkpoint.failure = 'unsupported_schema';
            return result('unsupported_schema');
          }
          const text = content.data
            .filter(
              (c) =>
                ['input_text', 'output_text'].includes(String(c['type'])) &&
                typeof c['text'] === 'string',
            )
            .map((c) => c['text'])
            .join('\n')
            .slice(0, 16000);
          if (text)
            records.push({
              ...base,
              kind: 'message',
              role: p['role'] as 'user' | 'assistant',
              text,
            });
        } else if (p['type'] === 'function_call' && typeof p['name'] === 'string')
          records.push({ ...base, kind: 'tool', role: 'assistant', text: p['name'].slice(0, 160) });
        else if (
          ![
            'function_call_output',
            'custom_tool_call',
            'custom_tool_call_output',
            'web_search_call',
            'image_generation_call',
            'agent_message',
          ].includes(String(p['type']))
        ) {
          checkpoint.failure = 'unsupported_schema';
          return result('unsupported_schema');
        }
      }
      return result(records.length ? 'observed' : 'unchanged');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return result(
        code === 'ENOENT'
          ? 'missing'
          : ['ELOOP', 'OBSERVATION_PATH_CHANGED'].includes(code ?? '')
            ? 'blocked_path'
            : 'read_error',
      );
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
}

/** Claude's official SDK reconstructs parentUuid chains; this wrapper supplies only one approved file. */
export async function observeClaudeFile(
  approvedRoot: string,
  relativeFile: string,
  projectRoot: string,
): Promise<{
  status: ObservationRead['status'];
  records: Observation[];
  fingerprint: string | null;
}> {
  const source = approvedSource(approvedRoot, relativeFile, projectRoot);
  let fd: number | undefined;
  try {
    const opened = openSource(source.file);
    fd = opened.fd;
    if (opened.stat.size > 2 * 1024 * 1024)
      return { status: 'limit_exceeded', records: [], fingerprint: null };
    const bytes = Buffer.alloc(opened.stat.size);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    const end = bytes.subarray(0, count).lastIndexOf(10) + 1;
    const partial = end < count;
    const complete = bytes.subarray(0, end);
    const entries: SessionStoreEntry[] = [];
    let sessionId: string | null = null;
    for (const line of new TextDecoder('utf-8', { fatal: true }).decode(complete).split('\n')) {
      if (!line.trim()) continue;
      const entry = z.object({ type: z.string() }).passthrough().parse(JSON.parse(line));
      if (['user', 'assistant'].includes(String(entry['type']))) {
        const meta = z
          .object({
            sessionId: z.string().uuid(),
            cwd: z.string().refine(isAbsolute),
            version: z.literal('2.1.286'),
          })
          .parse(entry);
        if (resolve(meta.cwd) !== source.projectRoot || (sessionId && sessionId !== meta.sessionId))
          return { status: 'unsupported_schema', records: [], fingerprint: hash(complete) };
        sessionId = meta.sessionId;
      }
      entries.push(entry);
    }
    if (!sessionId)
      return {
        status: partial ? 'partial' : 'unsupported_schema',
        records: [],
        fingerprint: hash(complete),
      };
    const messages = await getSessionMessages(sessionId, {
      dir: source.projectRoot,
      includeSystemMessages: false,
      sessionStore: {
        append: async () => {
          throw new Error('OBSERVATION_READ_ONLY');
        },
        load: async (key) => (key.sessionId === sessionId && !key.subpath ? entries : null),
      },
    });
    const records: Observation[] = [];
    for (const message of messages.slice(-128)) {
      if (message.type === 'system') continue;
      const body = z.record(z.string(), z.unknown()).parse(message.message);
      const content = body['content'];
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .flatMap((raw) => {
                  const block = z.record(z.string(), z.unknown()).safeParse(raw);
                  return block.success &&
                    block.data['type'] === 'text' &&
                    typeof block.data['text'] === 'string'
                    ? [block.data['text']]
                    : [];
                })
                .join('\n')
            : '';
      if (text)
        records.push({
          sourceId: hash(`${sessionId}:${message.uuid}:${hash(text)}`),
          sessionId,
          role: message.type,
          kind: 'message',
          text: text.slice(0, 16000),
        });
    }
    return {
      status: partial ? 'partial' : records.length ? 'observed' : 'unchanged',
      records,
      fingerprint: hash(complete),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      status:
        code === 'ENOENT'
          ? 'missing'
          : ['ELOOP', 'OBSERVATION_PATH_CHANGED'].includes(code ?? '')
            ? 'blocked_path'
            : 'unsupported_schema',
      records: [],
      fingerprint: null,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
