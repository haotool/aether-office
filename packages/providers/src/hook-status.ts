import { readFile } from 'node:fs/promises';
import { APP_VERSION } from '@aether/contracts';
import { APPROVAL_TAG, HOOK_MARKER, eventsFor } from './claude-hooks.js';
import { JsonRpcProcess } from './jsonrpc.js';

type HookState = 'installed' | 'partial' | 'not_installed';
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

export async function fileRemoteApprovals(path: string): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    const groups =
      isObject(parsed) && isObject(parsed['hooks']) ? parsed['hooks']['PermissionRequest'] : null;
    return list(groups).some((group) =>
      list(isObject(group) ? group['hooks'] : null).some(
        (hook) =>
          isObject(hook) &&
          typeof hook['command'] === 'string' &&
          hook['command'].includes(`${HOOK_MARKER}:${APPROVAL_TAG}`),
      ),
    );
  } catch {
    return false;
  }
}

type CodexHookTrust = { event: string; trusted: boolean; enabled: boolean };

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
      { clientInfo: { name: 'aether_office', title: 'AETHER OFFICE', version: APP_VERSION } },
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
