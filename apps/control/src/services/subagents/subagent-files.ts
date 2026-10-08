import { lstat, readdir, stat } from 'node:fs/promises';
import { deleteOldest } from '../platform/oldest-entry.js';
import { join } from 'node:path';
import { redactSecrets } from '../platform/redaction.js';
import { readEdge } from '../platform/file-edge.js';
import { mapPool } from '../runtime/pool.js';
import { plainSummary } from './subagent-text.js';

/**
 * Where Claude Code keeps a session's subagents: `<session>.jsonl` has a sibling folder `<session>/subagents/` holding
 * `agent-<id>.jsonl` (the subagent's own transcript, every line carrying that `agentId`) and `agent-<id>.meta.json` (what the
 * parent asked for). The `<id>` in the file name is the `agent_id` the hooks report, which is what ties a file to a hook
 * record (checked on real files, see docs/provider-compatibility.md). Only names, times and a few meta fields are read here.
 */
const STAT_WIDTH = 16;
const MAX_FILES_PER_SESSION = 16;
const META_BYTES = 8 * 1024;
const LABEL_CHARS = 60;
const TYPE_CHARS = 40;
const FILE_NAME = /^agent-([A-Za-z0-9_-]{1,80})\.jsonl$/;
const TOOL_ID = /^[\w.:-]{1,80}$/;

export type SubagentFile = {
  id: string;
  file: string;
  mtime: number;
  size: number;
  /** When the file was created, which is when the subagent started; null where the file system keeps no creation time. */
  startedAt: number | null;
};
type SubagentMeta = {
  type: string;
  label: string | null;
  /** The parent's tool call that spawned it: how its result is found in the parent's transcript. */
  toolUseId: string | null;
  foreground: boolean;
};

/** The subagent files of a session changed within `windowMs`, newest first, at most MAX_FILES_PER_SESSION. */
export async function listSubagentFiles(
  sessionFile: string,
  now: number,
  windowMs: number,
): Promise<SubagentFile[]> {
  const folder = sessionFile.replace(/\.jsonl$/, '');
  const dir = join(folder, 'subagents');
  // Links are never followed (neither folder, nor a file in it, may be one): a path in a transcript tree is only what it says.
  const plain = (path: string) =>
    lstat(path).then(
      (s) => s.isDirectory(),
      () => false,
    );
  if (!(await plain(folder)) || !(await plain(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found: SubagentFile[] = [];
  await mapPool(
    entries.filter((e) => e.isFile() && FILE_NAME.test(e.name)),
    STAT_WIDTH,
    async ({ name }) => {
      const file = join(dir, name);
      try {
        const s = await stat(file);
        const id = FILE_NAME.exec(name)?.[1];
        if (id && now - s.mtimeMs < windowMs)
          found.push({
            id,
            file,
            mtime: s.mtimeMs,
            size: s.size,
            startedAt: s.birthtimeMs > 0 ? Math.round(s.birthtimeMs) : null,
          });
      } catch {
        /* vanished */
      }
    },
  );
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_FILES_PER_SESSION);
}

// A meta file never changes after the subagent starts, so each is read once.
const metas = new Map<string, SubagentMeta>();
const MAX_METAS = 1024;
export const resetSubagentMetas = () => metas.clear();

/** The type, label and spawning call of a subagent, from its meta file; defaults when the file is missing or unreadable. */
export async function readSubagentMeta(file: string): Promise<SubagentMeta> {
  const known = metas.get(file);
  if (known) return known;
  try {
    const path = file.replace(/\.jsonl$/, '.meta.json');
    if (!(await lstat(path)).isFile()) throw new Error('not a regular file');
    const raw = JSON.parse(await readEdge(path, 'head', META_BYTES)) as Record<string, unknown>;
    const type = typeof raw['agentType'] === 'string' ? redactSecrets(raw['agentType']).trim() : '';
    const description = typeof raw['description'] === 'string' ? raw['description'] : '';
    const toolUseId = raw['toolUseId'];
    const meta: SubagentMeta = {
      type: /^[\w .:-]+$/.test(type) && type.length <= TYPE_CHARS ? type : 'subagent',
      label: description ? plainSummary(description, LABEL_CHARS) || null : null,
      toolUseId: typeof toolUseId === 'string' && TOOL_ID.test(toolUseId) ? toolUseId : null,
      foreground: raw['requestShape'] === 'foreground',
    };
    if (metas.size >= MAX_METAS) deleteOldest(metas);
    metas.set(file, meta);
    return meta;
  } catch {
    // Not there yet (it may be written just after the transcript), or not readable: ask again next time.
    return { type: 'subagent', label: null, toolUseId: null, foreground: false };
  }
}
