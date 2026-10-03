import { readFile } from 'node:fs/promises';
import { HOOK_MARKER, eventsFor } from './claude-hooks.js';
import { JsonRpcProcess } from './jsonrpc.js';

export type HookState = 'installed' | 'partial' | 'not_installed';
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Pure. The hooks file is hand-editable, so any node can be the wrong shape: that reads as "event absent", never throws. */
export function registeredEvents(parsed: unknown, events: readonly string[]): Set<string> {
  const hooks = isObject(parsed) && isObject(parsed['hooks']) ? parsed['hooks'] : {};
  return new Set(
    events.filter((event) =>
      list(hooks[event]).some((group) =>
        list(isObject(group) ? group['hooks'] : null).some(
          (hook) =>
            isObject(hook) &&
            typeof hook['command'] === 'string' &&
            hook['command'].includes(`${HOOK_MARKER}:${event}`),
        ),
      ),
    ),
  );
}

export const stateOf = (found: number, wanted: number): HookState =>
  found === 0 ? 'not_installed' : found === wanted ? 'installed' : 'partial';

export async function fileHookStatus(path: string, provider: 'claude' | 'codex') {
  const wanted = eventsFor(provider);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    /* absent or unreadable: nothing is installed */
  }
  const present = registeredEvents(parsed, wanted);
  return {
    state: stateOf(present.size, wanted.length),
    missing: wanted.filter((e) => !present.has(e)),
  };
}

export type CodexHookTrust = { event: string; trusted: boolean; enabled: boolean };

/** Asks Codex itself (read-only `hooks/list`) which of our hooks it will run. */
export async function codexHookTrust(
  binary: string,
  cwd: string,
  timeoutMs = 15000,
): Promise<CodexHookTrust[]> {
  const rpc = new JsonRpcProcess(binary, ['app-server'], { cwd });
  try {
    await rpc.ready;
    await rpc.request(
      'initialize',
      { clientInfo: { name: 'aether_office', title: 'AETHER OFFICE', version: '0.4.0-dev.0' } },
      timeoutMs,
    );
    rpc.notify('initialized');
    const result = await rpc.request('hooks/list', { cwds: [cwd] }, timeoutMs);
    const found: CodexHookTrust[] = [];
    for (const entry of list(isObject(result) ? result['data'] : null))
      for (const hook of list(isObject(entry) ? entry['hooks'] : null))
        if (isObject(hook) && String(hook['command']).includes(HOOK_MARKER))
          found.push({
            event: String(hook['eventName']),
            trusted: hook['trustStatus'] === 'trusted',
            enabled: hook['enabled'] !== false,
          });
    return found;
  } finally {
    rpc.close();
  }
}
