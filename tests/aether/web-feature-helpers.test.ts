import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttributedSession } from '../../packages/contracts/src/index.js';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';

// api.ts keeps its CSRF token in sessionStorage and opens a BroadcastChannel as it loads.
installBrowserEnv();
const { reapZombies } = await import('../../apps/web/src/features/reap.js');
const { TERMINAL_KEYS } = await import('../../apps/web/src/features/terminal-keys.js');
const { FEED_AVATAR_STATE } = await import('../../apps/web/src/features/feed-avatar.js');
const { useOutbox } = await import('../../apps/web/src/features/outbox.js');
const { clockOutKeys, kindOf, sessionOf } =
  await import('../../apps/web/src/features/character-session.js');
const { checkForm } = await import('../../apps/web/src/form-errors.js');

afterAll(removeBrowserEnv);

describe('reapZombies', () => {
  const sent: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    sent.length = 0;
    installGlobal('fetch', (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return Promise.resolve(Response.json({ nudged: 2, before: 3, after: 1 }));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts the process start time the person saw, so the server can refuse a different process', async () => {
    const result = await reapZombies({
      key: 'claude:a/b',
      liveness: { startedAt: 1_700_000_000_000 },
    } as AttributedSession);
    expect(result).toEqual({ nudged: 2, before: 3, after: 1 });
    expect(sent[0]!.url).toBe('/api/local-sessions/claude%3Aa%2Fb/reap-zombies');
    expect(sent[0]!.init.method).toBe('POST');
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual({ startedAt: 1_700_000_000_000 });
  });

  it('surfaces the server refusal as an error', async () => {
    installGlobal('fetch', () =>
      Promise.resolve(Response.json({ error: { code: 'SESSION_CHANGED' } }, { status: 409 })),
    );
    await expect(
      reapZombies({ key: 'k', liveness: { startedAt: 1 } } as AttributedSession),
    ).rejects.toMatchObject({ code: 'SESSION_CHANGED', status: 409 });
  });
});

describe('phone terminal keys', () => {
  it('send what a terminal expects, each key once', () => {
    const send = Object.fromEntries(TERMINAL_KEYS.map((k) => [k.label, k.send]));
    expect(send).toMatchObject({
      Esc: '\x1b',
      Tab: '\t',
      '^C': '\x03',
      '^D': '\x04',
      '↑': '\x1b[A',
      '↓': '\x1b[B',
      '→': '\x1b[C',
      '←': '\x1b[D',
      '⏎': '\r',
    });
    expect(new Set(TERMINAL_KEYS.map((k) => k.label)).size).toBe(TERMINAL_KEYS.length);
    expect(TERMINAL_KEYS.every((k) => k.label_zh.length > 0)).toBe(true);
  });
});

describe('feed avatar state', () => {
  it('draws each bucket of the feed with the portrait of the same name', () => {
    expect(FEED_AVATAR_STATE).toEqual({
      needs: 'needs',
      working: 'working',
      finished: 'finished',
      idle: 'idle',
    });
  });
});

describe('outbox', () => {
  const pending = (id: string) => ({ localId: id, text: id, at: 1, state: 'queued' as const });
  afterEach(() => useOutbox.setState({ bySession: {} }));

  it('keeps each session’s messages apart and hands the change the current list', () => {
    const { update } = useOutbox.getState();
    update('s1', (list) => [...list, pending('a')]);
    update('s2', (list) => [...list, pending('b')]);
    update('s1', (list) => {
      expect(list.map((p) => p.localId)).toEqual(['a']);
      return [...list, pending('c')];
    });
    const { bySession } = useOutbox.getState();
    expect(bySession['s1']!.map((p) => p.localId)).toEqual(['a', 'c']);
    expect(bySession['s2']!.map((p) => p.localId)).toEqual(['b']);
  });

  it('starts every session with an empty list and does not mutate the previous state', () => {
    const before = useOutbox.getState().bySession;
    useOutbox.getState().update('new', (list) => {
      expect(list).toEqual([]);
      return [pending('x')];
    });
    expect(before).toEqual({});
  });
});

describe('character sessions', () => {
  it('tells observed sessions, their subagents and managed agents apart by id', () => {
    expect(kindOf('local:claude:abc')).toBe('observed');
    expect(kindOf('agent-7')).toBe('managed');
    expect(kindOf('local:claude:abc:sub:s1')).toBe('subagent');
  });

  const session = (key: string, idleDays: number): AttributedSession =>
    ({
      key,
      provider: 'claude',
      sessionId: key,
      projectId: 'p',
      process: 'running',
      liveness: { state: 'dormant', startedAt: 1, quietMs: idleDays * 86_400_000 },
    }) as unknown as AttributedSession;

  it('finds a member’s session only for an observed one', () => {
    const sessions = [session('claude:a', 0), session('claude:b', 0)];
    expect(sessionOf(sessions, { id: 'local:claude:b' })?.key).toBe('claude:b');
    expect(sessionOf(sessions, { id: 'agent-7' })).toBeNull();
    expect(sessionOf(sessions, { id: 'local:claude:missing' })).toBeNull();
  });

  it('lists clock-out candidates among the given members only', () => {
    const sessions = [session('claude:old', 3), session('claude:fresh', 0)];
    expect(clockOutKeys(sessions, ['local:claude:old', 'local:claude:fresh', 'agent-7'])).toEqual([
      'claude:old',
    ]);
    expect(clockOutKeys(sessions, ['agent-7'])).toEqual([]);
  });
});

describe('checkForm', () => {
  class Field {
    focused = false;
    constructor(
      public name: string,
      public value: string,
      public required: boolean,
      public validity = { valid: true, valueMissing: false },
    ) {}
    focus() {
      this.focused = true;
    }
  }
  class Input extends Field {}
  class Area extends Field {}
  class Select extends Field {}
  beforeEach(() => {
    installGlobal('HTMLInputElement', Input);
    installGlobal('HTMLTextAreaElement', Area);
    installGlobal('HTMLSelectElement', Select);
  });
  const form = (...elements: unknown[]) => ({ elements }) as unknown as HTMLFormElement;

  it('is empty, and focuses nothing, when every field is fine', () => {
    const ok = new Input('name', 'x', true);
    expect(checkForm(form(ok, new Area('note', '', false)))).toEqual({});
    expect(ok.focused).toBe(false);
  });

  it('calls a blank required field required, even when it holds only spaces, and focuses the first failure', () => {
    const first = new Input('name', '   ', true);
    const second = new Area('about', '', true);
    expect(checkForm(form(first, second))).toEqual({
      name: 'fieldRequired',
      about: 'fieldRequired',
    });
    expect(first.focused).toBe(true);
    expect(second.focused).toBe(false);
  });

  it('calls a field that breaks a pattern or length rule invalid, and one that is missing a value required', () => {
    const bad = new Input('port', '99999', false, { valid: false, valueMissing: false });
    const missing = new Select('kind', 'x', false, { valid: false, valueMissing: true });
    expect(checkForm(form(bad, missing))).toEqual({ port: 'fieldInvalid', kind: 'fieldRequired' });
  });

  it('ignores controls without a name and things that are not form controls', () => {
    const anonymous = new Input('', '', true);
    expect(checkForm(form(anonymous, { name: 'button' }))).toEqual({});
  });
});
