import { lstat, readdir, stat } from 'node:fs/promises';
import { deleteOldest } from '../platform/oldest-entry.js';
import { join } from 'node:path';
import { redactSecrets } from '../platform/redaction.js';
import { readEdge } from '../platform/file-edge.js';
import { mapPool } from '../runtime/pool.js';
import { plainSummary } from './subagent-text.js';

/**
 * Claude Code keeps a session's subagents in `<session>/subagents/`: `agent-<id>.jsonl` (transcript) and
 * `agent-<id>.meta.json` (what the parent asked for). `<id>` is the hooks' `agent_id` (see
 * docs/provider-compatibility.md).
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
  startedAt: number | null;
};
type SubagentMeta = {
  type: string;
  label: string | null;
  toolUseId: string | null;
  foreground: boolean;
};

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
    return { type: 'subagent', label: null, toolUseId: null, foreground: false };
  }
}
