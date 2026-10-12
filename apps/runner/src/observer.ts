import { closeSync, readSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { getSessionMessages, type SessionStoreEntry } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { claudeRolloutVersion } from '@aether/providers';
import { checkpointSchema, decodeLine, type ObserverCheckpoint } from './observer-codex-lines.js';
import {
  approvedSource,
  hash,
  openSource,
  pathFailureStatus,
  type Observation,
} from './observer-source.js';

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
type Status = ObservationRead['status'];

const MAX_LINE_BYTES = 65536;
const MAX_LINES_PER_READ = 128;
const MAX_READ_BYTES = 256 * 1024;
const MAX_CLAUDE_MESSAGES = 128;

function resumeCheckpoint(
  previous: ObserverCheckpoint | null,
  identity: string,
  size: number,
  prefix: Buffer,
) {
  const rotated =
    previous !== null &&
    (previous.identity !== identity ||
      size < previous.offset ||
      prefix.length < previous.prefixLength ||
      hash(prefix.subarray(0, previous.prefixLength)) !== previous.prefixHash);
  const checkpoint: ObserverCheckpoint =
    previous && !rotated
      ? { ...previous }
      : { identity, offset: 0, prefixLength: 0, prefixHash: hash(''), meta: null, failure: null };
  checkpoint.prefixLength = prefix.length;
  checkpoint.prefixHash = hash(prefix);
  return { checkpoint, rotated };
}

function incompleteStatus(
  checkpoint: ObserverCheckpoint,
  pending: number,
  endsAtFileEnd: boolean,
  found: number,
): Status {
  if (pending > MAX_LINE_BYTES) {
    checkpoint.failure = 'limit_exceeded';
    return 'limit_exceeded';
  }
  return endsAtFileEnd ? 'partial' : found ? 'observed' : 'unchanged';
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

  private decodeLines(
    buffer: Buffer,
    count: number,
    startOffset: number,
    size: number,
    checkpoint: ObserverCheckpoint,
    records: Observation[],
  ): Status {
    let position = 0,
      lines = 0;
    while (position < count && lines++ < MAX_LINES_PER_READ) {
      const newline = buffer.subarray(0, count).indexOf(10, position);
      if (newline < 0)
        return incompleteStatus(
          checkpoint,
          count - position,
          startOffset + count >= size,
          records.length,
        );
      if (newline - position > MAX_LINE_BYTES) {
        checkpoint.failure = 'limit_exceeded';
        return 'limit_exceeded';
      }
      const offset = startOffset + position;
      const line = buffer.subarray(position, newline);
      position = newline + 1;
      checkpoint.offset = startOffset + position;
      if (!line.length || (line.length === 1 && line[0] === 13)) continue;
      const outcome = decodeLine(line, offset, checkpoint, this.projectRoot);
      if (outcome === 'unsupported_schema') {
        checkpoint.failure = 'unsupported_schema';
        return 'unsupported_schema';
      }
      if (outcome) records.push(outcome);
    }
    return records.length ? 'observed' : 'unchanged';
  }

  read(previous: ObserverCheckpoint | null = null): ObservationRead {
    let checkpoint = previous ? checkpointSchema.parse(previous) : null;
    const records: Observation[] = [];
    let fd: number | undefined;
    let rotated = false;
    const result = (status: Status): ObservationRead => ({ status, records, checkpoint, rotated });
    try {
      const opened = openSource(this.file);
      fd = opened.fd;
      const stat = opened.stat;
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      const prefix = Buffer.alloc(Math.min(256, stat.size));
      readSync(fd, prefix, 0, prefix.length, 0);
      const resumed = resumeCheckpoint(checkpoint, identity, stat.size, prefix);
      checkpoint = resumed.checkpoint;
      rotated = resumed.rotated;
      if (checkpoint.failure) return result(checkpoint.failure);
      const startOffset = checkpoint.offset;
      const buffer = Buffer.alloc(Math.min(MAX_READ_BYTES, stat.size - startOffset));
      const count = readSync(fd, buffer, 0, buffer.length, startOffset);
      return result(this.decodeLines(buffer, count, startOffset, stat.size, checkpoint, records));
    } catch (error) {
      return result(pathFailureStatus(error) ?? 'read_error');
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
}

type ClaudeObservation = {
  status: Status;
  records: Observation[];
  fingerprint: string | null;
};
const claudeMeta = z.object({
  sessionId: z.string().uuid(),
  cwd: z.string().refine(isAbsolute),
  version: z.string().refine(claudeRolloutVersion),
});

function claudeEntries(complete: Buffer, projectRoot: string) {
  const entries: SessionStoreEntry[] = [];
  let sessionId: string | null = null;
  for (const line of new TextDecoder('utf-8', { fatal: true }).decode(complete).split('\n')) {
    if (!line.trim()) continue;
    const entry = z.object({ type: z.string() }).passthrough().parse(JSON.parse(line));
    if (['user', 'assistant'].includes(String(entry['type']))) {
      const meta = claudeMeta.parse(entry);
      if (resolve(meta.cwd) !== projectRoot || (sessionId && sessionId !== meta.sessionId))
        return null;
      sessionId = meta.sessionId;
    }
    entries.push(entry);
  }
  return { entries, sessionId };
}

function claudeText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((raw) => {
      const block = z.record(z.string(), z.unknown()).safeParse(raw);
      return block.success &&
        block.data['type'] === 'text' &&
        typeof block.data['text'] === 'string'
        ? [block.data['text']]
        : [];
    })
    .join('\n');
}

/** The SDK reconstructs the conversation (parentUuid chains) from the one approved file, offered as a read-only store. */
async function claudeRecords(
  entries: SessionStoreEntry[],
  sessionId: string,
  projectRoot: string,
): Promise<Observation[]> {
  const messages = await getSessionMessages(sessionId, {
    dir: projectRoot,
    includeSystemMessages: false,
    sessionStore: {
      append: async () => {
        throw new Error('OBSERVATION_READ_ONLY');
      },
      load: async (key) => (key.sessionId === sessionId && !key.subpath ? entries : null),
    },
  });
  const records: Observation[] = [];
  for (const message of messages.slice(-MAX_CLAUDE_MESSAGES)) {
    if (message.type === 'system') continue;
    const body = z.record(z.string(), z.unknown()).parse(message.message);
    const text = claudeText(body['content']);
    if (text)
      records.push({
        sourceId: hash(`${sessionId}:${message.uuid}:${hash(text)}`),
        sessionId,
        role: message.type,
        kind: 'message',
        text: text.slice(0, 16000),
      });
  }
  return records;
}

export async function observeClaudeFile(
  approvedRoot: string,
  relativeFile: string,
  projectRoot: string,
): Promise<ClaudeObservation> {
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
    const fingerprint = hash(complete);
    const parsed = claudeEntries(complete, source.projectRoot);
    if (!parsed) return { status: 'unsupported_schema', records: [], fingerprint };
    if (!parsed.sessionId)
      return { status: partial ? 'partial' : 'unsupported_schema', records: [], fingerprint };
    const records = await claudeRecords(parsed.entries, parsed.sessionId, source.projectRoot);
    return {
      status: partial ? 'partial' : records.length ? 'observed' : 'unchanged',
      records,
      fingerprint,
    };
  } catch (error) {
    return {
      status: pathFailureStatus(error) ?? 'unsupported_schema',
      records: [],
      fingerprint: null,
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
