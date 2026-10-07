import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { LocalSession } from '../../packages/contracts/src/index.js';
import { createServer } from '../../apps/control/src/server.js';
import { revoke } from '../../apps/control/src/services/identity.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/local-sessions.js';
import { diffSessions } from '../../apps/control/src/services/session-changes.js';
import { fixture } from './fixture.js';
import { eventually, freePort } from './timing.js';

let PORT = 0;
let BASE = '';
const line = (v: unknown) => JSON.stringify(v) + '\n';

const session = (over: Partial<LocalSession> = {}): LocalSession =>
  ({
    key: 'claude:a',
    process: 'running',
    mtime: 1,
    hook: null,
    subagents: [],
    liveness: { state: 'active' },
    ...over,
  }) as LocalSession;

it('diffs scans into the kinds of change per session, with no events for a first scan', () => {
  const first = diffSessions(null, [session()], {});
  expect(first.changed).toEqual([]);
  const same = diffSessions(first.next, [session()], {});
  expect(same.changed).toEqual([]);
  const moved = diffSessions(first.next, [session({ mtime: 2 })], {});
  expect(moved.changed).toEqual([{ key: 'claude:a', kinds: ['transcript'] }]);
  const spoke = diffSessions(first.next, [session()], {
    'claude:a': { user: null, assistant: { text: 'done', at: 1 } },
  });
  expect(spoke.changed).toEqual([{ key: 'claude:a', kinds: ['speech'] }]);
  const hooked = diffSessions(
    first.next,
    [
      session({
        hook: { activity: 'working', lastEvent: 'PreToolUse', tool: 'Bash', at: 1, recent: [] },
      }),
    ],
    {},
  );
  expect(hooked.changed[0]!.kinds.sort()).toEqual(['state', 'tool']);
  const gone = diffSessions(first.next, [], {});
  expect(gone.changed).toEqual([{ key: 'claude:a', kinds: ['state'] }]);
  // A session that appears is read whole: its reply is fetched with it, not left for the slow safety-net poll.
  const appeared = diffSessions(first.next, [session(), session({ key: 'claude:b' })], {});
  expect(appeared.changed).toEqual([{ key: 'claude:b', kinds: ['state', 'speech', 'transcript'] }]);
});

it('names squad and outcome changes by kind alone: ids, statuses, counts and flags, never words', () => {
  const child = (over: object = {}) => ({
    id: 'a1',
    type: 'Explore',
    status: 'running',
    tools: { count: 1, last: 'Read', lastAt: 1 },
    result: null,
    ...over,
  });
  const call = (ok: boolean | null) => ({
    tool: 'Bash',
    target: null,
    at: 5,
    agentId: null,
    tags: ['test'],
    ok,
  });
  const hooked = (ok: boolean | null) =>
    ({
      activity: 'working',
      lastEvent: 'PostToolUse',
      tool: null,
      at: 1,
      recent: [call(ok)],
    }) as never;
  const first = diffSessions(null, [session({ subagents: [child()] as never })], {});
  const changed = (over: Partial<LocalSession>) =>
    diffSessions(first.next, [session({ subagents: [child()] as never, ...over })], {}).changed;
  expect(changed({})).toEqual([]);
  expect(
    diffSessions(first.next, [session({ subagents: [child({ status: 'finished' })] as never })], {})
      .changed,
  ).toEqual([{ key: 'claude:a', kinds: ['squad'] }]);
  expect(
    diffSessions(
      first.next,
      [session({ subagents: [child({ tools: { count: 2, last: 'Edit', lastAt: 2 } })] as never })],
      {},
    ).changed,
  ).toEqual([{ key: 'claude:a', kinds: ['squad'] }]);
  expect(
    diffSessions(
      first.next,
      [
        session({
          subagents: [
            child({ result: { summary: 'SECRETWORDS', error: null, chars: 11 } }),
          ] as never,
        }),
      ],
      {},
    ).changed,
  ).toEqual([{ key: 'claude:a', kinds: ['squad'] }]);
  const withCall = diffSessions(
    first.next,
    [session({ subagents: [child()] as never, hook: hooked(null) })],
    {},
  );
  expect(withCall.changed[0]!.kinds).toContain('outcome');
  const settled = diffSessions(
    withCall.next,
    [session({ subagents: [child()] as never, hook: hooked(true) })],
    {},
  );
  expect(settled.changed).toEqual([{ key: 'claude:a', kinds: ['outcome'] }]);
  const conflict = diffSessions(
    first.next,
    [session({ subagents: [child()] as never, git: { conflicts: 2 } as never })],
    {},
  );
  expect(conflict.changed).toEqual([{ key: 'claude:a', kinds: ['outcome'] }]);
  expect(JSON.stringify([withCall.changed, settled.changed, conflict.changed])).not.toContain(
    'SECRETWORDS',
  );
});

type Fixture = Awaited<ReturnType<typeof setup>>;
async function setup(sessionStream = { scanMs: 40, heartbeatMs: 120, maxClients: 2 }) {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  const home = await mkdtemp(join(tmpdir(), 'aether-stream-'));
  const dir = join(home, '.claude/projects/-p');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'sess-1.jsonl');
  await writeFile(
    file,
    line({ type: 'user', cwd: home, message: { role: 'user', content: 'hi' } }),
  );
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  resetLocalSessionCache();
  const f = fixture();
  const app = createServer(f.control, { origin: BASE, sessionStream });
  await app.listen({ host: '127.0.0.1', port: PORT });
  const open = async (headers: Record<string, string> = {}, token = f.owner.token) => {
    const abort = new AbortController();
    const response = await fetch(`${BASE}/api/local-sessions/stream`, {
      headers: { authorization: `Bearer ${token}`, ...headers },
      signal: abort.signal,
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = '';
    /** Reads until `done(text)` holds, or fails at a deadline only a hang reaches. */
    // One read stays pending until it answers: a read that merely lost the race to the timer would still take the next chunk
    // and drop it, and under load that was the change the test was waiting for.
    let pending: ReturnType<NonNullable<typeof reader>['read']> | null = null;
    const until = async (done: (text: string) => boolean) => {
      const deadline = Date.now() + 8000;
      while (!done(text)) {
        if (Date.now() > deadline) throw new Error(`timed out; got: ${text}`);
        if (!pending) {
          pending = reader!.read();
          pending.catch(() => undefined); // an abort while nobody is waiting is not an error
        }
        const chunk = await Promise.race([
          pending,
          new Promise<null>((r) => setTimeout(() => r(null), 200)),
        ]);
        if (!chunk) continue;
        pending = null;
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      return text;
    };
    return { response, until, abort, text: () => text };
  };
  return { f, app, file, home, open };
}

let current: Fixture | null = null;
beforeEach(() => {
  current = null;
});
afterEach(async () => {
  delete process.env['AETHER_LOCAL_SESSIONS_HOME'];
  if (current) {
    await current.app.close();
    current.f.control.close();
  }
});
const start = async (...args: Parameters<typeof setup>) => (current = await setup(...args));
const idOf = (text: string) => [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));

it('streams a change when a transcript moves: headers, hello, increasing ids, no content', async () => {
  const s = await start();
  const stream = await s.open();
  expect(stream.response.status).toBe(200);
  expect(stream.response.headers.get('content-type')).toContain('text/event-stream');
  expect(stream.response.headers.get('cache-control')).toBe('no-store');
  expect(stream.response.headers.get('x-content-type-options')).toBe('nosniff');
  await stream.until((t) => t.includes('event: hello')); // said only after the baseline scan
  await appendFile(
    s.file,
    line({ type: 'assistant', message: { role: 'assistant', content: 'SECRETTEXT' } }),
  );
  const text = await stream.until((t) => t.includes('event: session'));
  expect(text).toContain('"key":"claude:sess-1"');
  expect(text).toMatch(/"kinds":\[[^\]]*"transcript"/);
  expect(text).not.toContain('SECRETTEXT');
  const ids = idOf(text);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  expect(ids[1]).toBeGreaterThan(ids[0]!);
  stream.abort.abort();
});

it('resumes from Last-Event-ID without losing or repeating changes, and resyncs when the id is too old', async () => {
  const s = await start();
  const first = await s.open();
  const hello = await first.until((t) => t.includes('event: hello'));
  const seq = idOf(hello)[0]!;
  await appendFile(s.file, line({ type: 'user', message: { role: 'user', content: 'one' } }));
  await first.until((t) => t.includes('event: session'));
  // a second client, connected from the same point, sees the change replayed
  const resumed = await s.open({ 'last-event-id': String(seq) });
  const replay = await resumed.until((t) => t.includes('event: session'));
  expect(replay).not.toContain('event: resync');
  expect(replay).toContain('"key":"claude:sess-1"');
  first.abort.abort();
  // an id from before the hub's memory is told to refetch (once the closed stream has freed its slot)
  const stale = await eventually(
    async () => {
      const attempt = await s.open({ 'last-event-id': '1' });
      return attempt.response.status === 200 && attempt;
    },
    10_000,
    'a free stream slot',
  );
  expect(await stale.until((t) => t.includes('event: resync'))).toContain('event: resync');
  for (const c of [first, resumed, stale]) c.abort.abort();
});

it('sends a heartbeat comment while nothing changes', async () => {
  const s = await start();
  const stream = await s.open();
  expect(await stream.until((t) => t.includes(': heartbeat'))).toContain(': heartbeat');
  stream.abort.abort();
});

it('is for owners and operators only, and refuses the anonymous', async () => {
  const s = await start();
  const viewer = s.f.control.createIdentity(s.f.owner.actor, {
    name: 'Viewer',
    role: 'viewer',
    projectIds: [s.f.projectId],
  });
  const operator = s.f.control.createIdentity(s.f.owner.actor, {
    name: 'Operator',
    role: 'operator',
    projectIds: [s.f.projectId],
  });
  expect((await s.open({}, viewer.token)).response.status).toBe(403);
  expect((await s.open({}, s.f.sender.token)).response.status).toBe(403); // an agent
  expect((await fetch(`${BASE}/api/local-sessions/stream`)).status).toBe(401);
  const ok = await s.open({}, operator.token);
  expect(ok.response.status).toBe(200);
  ok.abort.abort();
});

it('caps the number of open streams and frees a slot when one closes', async () => {
  const s = await start();
  const a = await s.open();
  const b = await s.open();
  await a.until((t) => t.includes('hello'));
  await b.until((t) => t.includes('hello'));
  const refused = await s.open();
  expect(refused.response.status).toBe(429);
  a.abort.abort();
  const again = await eventually(
    async () => {
      const attempt = await s.open();
      return attempt.response.status === 200 && attempt;
    },
    10_000,
    'a free stream slot',
  );
  for (const c of [b, again]) c.abort.abort();
});

it('ends the stream with a fault when the credential is revoked', async () => {
  const s = await start();
  const operator = s.f.control.createIdentity(s.f.owner.actor, {
    name: 'Soon revoked',
    role: 'operator',
    projectIds: [s.f.projectId],
  });
  const stream = await s.open({}, operator.token);
  await stream.until((t) => t.includes('event: hello'));
  revoke(s.f.control.ctx, s.f.owner.actor, operator.actor.id);
  expect(await stream.until((t) => t.includes('event: fault'))).toContain('event: fault');
});

it('answers the heavy reads with an ETag and a 304 for an unchanged answer, and keeps others uncacheable', async () => {
  const s = await start();
  const get = (url: string, extra: Record<string, string> = {}) =>
    s.app.inject({
      url,
      headers: { host: `127.0.0.1:${PORT}`, authorization: `Bearer ${s.f.owner.token}`, ...extra },
    });
  for (const url of [
    '/api/local-sessions/speech',
    '/api/local-sessions/claude:sess-1/transcript',
  ]) {
    await get('/api/local-sessions'); // registers the session key
    const first = await get(url);
    expect(first.statusCode).toBe(200);
    const etag = String(first.headers['etag']);
    expect(etag).toMatch(/^W\/"/);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const second = await get(url, { 'if-none-match': etag });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    expect((await get(url, { 'if-none-match': 'W/"other"' })).statusCode).toBe(200);
  }
  expect((await get('/api/capabilities')).headers['etag']).toBeUndefined();
  expect((await get('/api/capabilities')).headers['cache-control']).toBe('no-store');
});

it('says hello only after the baseline scan, so what a page reads next is not older than the baseline', async () => {
  const s = await start();
  const read = async () =>
    (
      (await (
        await fetch(`${BASE}/api/local-sessions`, {
          headers: { authorization: `Bearer ${s.f.owner.token}` },
        })
      ).json()) as { sessions: unknown[] }
    ).sessions.length;
  expect(await read()).toBe(1); // warms the page's 5 s cache
  await writeFile(
    join(s.home, '.claude/projects/-p/sess-2.jsonl'),
    line({ type: 'user', cwd: s.home, message: { role: 'user', content: 'new' } }),
  );
  await new Promise((r) => setTimeout(r, 80)); // older than the stream's own scan window
  const stream = await s.open();
  await stream.until((t) => t.includes('event: hello'));
  expect(await read()).toBe(2); // a session that appeared before the baseline is in what the page reads after hello
  stream.abort.abort();
});
