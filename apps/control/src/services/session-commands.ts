import { open, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CustomCommand } from '@aether/contracts';
import { redactSecrets } from './redaction.js';

const MAX_COMMANDS = 200;
const MAX_ENTRIES_PER_DIR = 500;
const MAX_DEPTH = 3;
const HEAD_BYTES = 2048;
const DESCRIPTION_CHARS = 140;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Pure. The one-line description of a command or skill file: its `description:` field, else its first line of prose. */
function describe(head: string): string {
  const text = head.replace(/^﻿/, '');
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const field = front && /^description:\s*(.+)$/m.exec(front[1] ?? '');
  const prose = text
    .slice(front ? front[0].length : 0)
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  const line = (field?.[1] ?? prose ?? '').trim().replace(/^(["'])(.*)\1$/, '$2');
  return redactSecrets(line).slice(0, DESCRIPTION_CHARS);
}

async function head(file: string): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const { bytesRead, buffer } = await handle.read(Buffer.alloc(HEAD_BYTES), 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/** Markdown commands, recursively: a sub-folder is a namespace. Symbolic links are never followed. */
async function commandsIn(dir: string, prefix: string, depth: number): Promise<[string, string][]> {
  const entries = (await readdir(dir, { withFileTypes: true }).catch(() => [])).slice(
    0,
    MAX_ENTRIES_PER_DIR,
  );
  const found: [string, string][] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && depth < MAX_DEPTH && NAME.test(entry.name))
      found.push(
        ...(await commandsIn(join(dir, entry.name), `${prefix}${entry.name}:`, depth + 1)),
      );
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      const name = entry.name.slice(0, -3);
      if (NAME.test(name))
        found.push([
          `${prefix}${name}`,
          describe(await head(join(dir, entry.name)).catch(() => '')),
        ]);
    }
  }
  return found;
}

/** Skills: `<dir>/<name>/SKILL.md`. A skill folder may be a link (installed skills are); only that one file is read. */
async function skillsIn(dir: string): Promise<[string, string][]> {
  const entries = (await readdir(dir, { withFileTypes: true }).catch(() => [])).slice(
    0,
    MAX_ENTRIES_PER_DIR,
  );
  const found: [string, string][] = [];
  for (const entry of entries) {
    if (!NAME.test(entry.name) || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
    const file = await realpath(join(dir, entry.name, 'SKILL.md')).catch(() => null);
    if (file && (await stat(file)).isFile())
      found.push([entry.name, describe(await head(file).catch(() => ''))]);
  }
  return found;
}

/**
 * The custom slash commands and skills of a session: those in its directory and those in the user's Claude folder.
 * Names and one-line descriptions only, bounded, redacted. `cwd` is the session's own (looked up on the server, never
 * supplied by the browser). Codex keeps its prompts elsewhere, so only Claude sessions have any.
 */
export async function listCustomCommands(
  provider: 'claude' | 'codex',
  cwd: string,
  home: string,
): Promise<CustomCommand[]> {
  if (provider !== 'claude') return [];
  const out: CustomCommand[] = [];
  for (const [base, source] of [
    [cwd, 'project'],
    [home, 'user'],
  ] as const) {
    const claude = join(base, '.claude');
    const [commands, skills] = await Promise.all([
      commandsIn(join(claude, 'commands'), '', 0),
      skillsIn(join(claude, 'skills')),
    ]);
    for (const [kind, list] of [
      ['command', commands],
      ['skill', skills],
    ] as const)
      for (const [name, description] of list)
        if (!out.some((c) => c.name === name)) out.push({ name, description, source, kind });
  }
  return out.slice(0, MAX_COMMANDS);
}
