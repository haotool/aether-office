import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

// Claude Code project-scope hook installer. Opt-in, namespaced, atomic, reversible.
// Our entries are identified only by MARKER inside `command`; everything else is left untouched.
export const HOOK_MARKER = 'aether-office-hook';
export const HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'Stop',
] as const;

type HookCmd = { type?: string; command?: string; [k: string]: unknown };
type Group = { matcher?: string; hooks?: HookCmd[]; [k: string]: unknown };
type Settings = { hooks?: Record<string, Group[]>; [k: string]: unknown };

const ours = (c: HookCmd) => typeof c.command === 'string' && c.command.includes(HOOK_MARKER);

function assertScript(script: string) {
  if (!isAbsolute(script) || /["'`$\n\r]/.test(script)) throw new Error('HOOK_SCRIPT_INVALID');
}

export function removeHooks(settings: Settings): Settings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, Group[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = (groups ?? []).flatMap((g) => {
      if (!(g.hooks ?? []).some(ours)) return [g]; // untouched user group
      const rest = (g.hooks ?? []).filter((c) => !ours(c));
      return rest.length ? [{ ...g, hooks: rest }] : [];
    });
    if (kept.length) hooks[event] = kept;
  }
  const { hooks: _drop, ...rest } = settings;
  return Object.keys(hooks).length ? { ...rest, hooks } : rest;
}

// Idempotent: update == remove ours, then add ours. User hooks keep their position and content.
export function installHooks(
  settings: Settings,
  script: string,
  events: readonly string[] = HOOK_EVENTS,
): Settings {
  assertScript(script);
  const base = removeHooks(settings);
  const hooks: Record<string, Group[]> = { ...(base.hooks ?? {}) };
  for (const event of events) {
    const command = `${JSON.stringify(script)} ${event} # ${HOOK_MARKER}`;
    hooks[event] = [...(hooks[event] ?? []), { hooks: [{ type: 'command', command, timeout: 5 }] }];
  }
  return { ...base, hooks };
}

async function load(path: string): Promise<Settings> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error('SETTINGS_NOT_JSON', { cause });
  } // never overwrite what we cannot parse
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('SETTINGS_NOT_OBJECT');
  return parsed as Settings;
}

async function save(path: string, next: Settings) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await copyFile(
      path,
      `${path}.aether-backup`,
      1 /* COPYFILE_EXCL: keep the first, pristine backup */,
    );
  } catch (e) {
    if (
      (e as NodeJS.ErrnoException).code !== 'ENOENT' &&
      (e as NodeJS.ErrnoException).code !== 'EEXIST'
    )
      throw e;
  }
  const tmp = `${path}.aether-tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

export async function installHooksFile(path: string, script: string, events?: readonly string[]) {
  await save(path, installHooks(await load(path), script, events));
}
export async function removeHooksFile(path: string) {
  await save(path, removeHooks(await load(path)));
}
