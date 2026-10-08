import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttributedSession } from '../../packages/contracts/src/index.js';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import { renderHook } from './fixtures/mini-react.js';
import { create } from './fixtures/mini-zustand.js';
import { optionsFor, resetQueries, seed, store } from './fixtures/mini-query.js';

// The data hooks on synthetic stand-ins (fixtures/): React's hook runtime, zustand's hook, and a query library that records
// the options it is given and answers from a cache the test fills. What is checked is the app's own rules: which requests,
// when they run, how often they repeat, and what the hooks make of the answers.
const env = installBrowserEnv();
const web = await vi.hoisted(async () => {
  const paths = await import('./fixtures/web-paths.js');
  return { react: paths.WEB_REACT, zustand: paths.WEB_ZUSTAND, query: paths.WEB_QUERY };
});
vi.mock(web.react, () => import('./fixtures/mini-react.js'));
vi.mock(web.zustand, () => import('./fixtures/mini-zustand.js'));
vi.mock(web.query, () => import('./fixtures/mini-query.js'));
const prefs = create<{ locale: 'en' | 'zh-TW' }>(() => ({ locale: 'en' }));
vi.mock('../../apps/web/src/lib/preferences/state.js', () => ({ usePreferences: prefs }));

const { useModels } = await import('../../apps/web/src/features/settings/useModels.js');
const { useGitKpi, useUsage } = await import('../../apps/web/src/features/kpi/use-kpi.js');
const { useKpiPanel } = await import('../../apps/web/src/features/kpi/use-kpi-panel.js');
const { useApprovals, useLocalSessions } = await import('../../apps/web/src/lib/app/app-data.js');
const { useActor, useCachedSessions, useTerminalState } =
  await import('../../apps/web/src/features/sessions/character-session.js');
const { useContinue } = await import('../../apps/web/src/features/shell-chrome/use-continue.js');
const { useLink } = await import('../../apps/web/src/hooks/use-session-stream.js');
const { usePermissionRequests } =
  await import('../../apps/web/src/features/operations/permission-requests.js');
const { useAdoptRepos } = await import('../../apps/web/src/features/integrations/adoptProjects.js');

afterAll(removeBrowserEnv);
const sent: { url: string; body: unknown }[] = [];
let answers: Record<string, unknown>;
beforeEach(() => {
  resetQueries();
  sent.length = 0;
  answers = {};
  env.storage.clear();
  useLink.setState({ status: 'connecting', failures: 0, lastAt: null });
  installGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    return Promise.resolve(Response.json(answers[url] ?? {}));
  });
});
const interval = (key: unknown[], data: unknown, error: unknown = null) =>
  (optionsFor(key).refetchInterval as (q: unknown) => unknown)({ state: { data, error } });

const operator = { actor: { id: 'u1', role: 'operator', projectIds: [] }, mode: 'live' };
const session = (over: Record<string, unknown> = {}) =>
  ({
    key: 'claude:a',
    provider: 'claude',
    sessionId: 'a',
    cwd: '/work/app',
    projectId: 'p1',
    worktree: null,
    hook: null,
    subagents: [],
    process: 'running',
    ...over,
  }) as unknown as AttributedSession;

describe('useModels', () => {
  it('lists the catalogs once loaded and asks the server to look again on refresh', async () => {
    seed(['models'], { catalogs: [{ provider: 'claude', models: [] }] });
    const hook = renderHook(useModels);
    expect(hook.current.catalogs).toHaveLength(1);
    expect(optionsFor(['models'])).toMatchObject({ retry: false, staleTime: 300_000 });
    answers['/api/models?refresh=1'] = { catalogs: [{ provider: 'codex', models: [] }] };
    await hook.current.refresh();
    expect(sent.map((s) => s.url)).toEqual(['/api/models?refresh=1']);
    expect(store.data.get('["models"]')).toEqual(answers['/api/models?refresh=1']);
  });

  it('is loading, with no catalogs, until the first answer', () => {
    const hook = renderHook(useModels);
    expect(hook.current).toMatchObject({ catalogs: undefined, loading: true });
  });
});

describe('usage hooks', () => {
  it('ask for the range they are given, and again soon while the first scan is still reading', () => {
    renderHook(useUsage, '7d');
    expect(optionsFor(['usage', '7d']).enabled).toBe(true);
    expect(interval(['usage', '7d'], undefined)).toBe(30_000);
    expect(interval(['usage', '7d'], { scan: { complete: false } })).toBe(4_000);
    expect(interval(['usage', '7d'], { scan: { complete: true } })).toBe(30_000);
  });

  it('ask the server for that range and fill in what an older server leaves out', async () => {
    renderHook(useUsage, '30d', false);
    expect(optionsFor(['usage', '30d']).enabled).toBe(false);
    answers['/api/usage?range=30d'] = { enabled: true, range: '30d', offices: [] };
    const normalized = (await optionsFor(['usage', '30d']).queryFn!()) as {
      days: unknown[];
      scan: { complete: boolean };
    };
    expect(normalized.days).toEqual([]);
    expect(normalized.scan.complete).toBe(false); // unknown is never "complete"
  });

  it('git KPIs wait longer once a building is known', () => {
    renderHook(useGitKpi);
    expect(interval(['usage-git'], undefined)).toBe(10_000);
    expect(interval(['usage-git'], { building: null })).toBe(10_000);
    expect(interval(['usage-git'], { building: { merged: 1 } })).toBe(60_000);
  });
});

describe('useKpiPanel', () => {
  it('opens on an office, switches office and closes', () => {
    const hook = renderHook(useKpiPanel);
    expect(hook.current).toMatchObject({ isOpen: false, office: null, range: '7d' });
    hook.current.open(2);
    expect(hook.current).toMatchObject({ isOpen: true, office: 2 });
    hook.current.setOffice(null);
    expect(hook.current).toMatchObject({ isOpen: true, office: null });
    hook.current.close();
    expect(hook.current.isOpen).toBe(false);
    hook.current.open();
    expect(hook.current).toMatchObject({ isOpen: true, office: null });
  });

  it('keeps the range the dashboard is on and counts the sessions that run', () => {
    seed(['local-sessions'], {
      sessions: [session(), session({ key: 'b', process: 'exited' }), session({ key: 'c' })],
    });
    const hook = renderHook(useKpiPanel);
    expect(hook.current.running).toBe(2);
    expect(hook.current.sessions).toHaveLength(3);
    hook.current.setRange('30d');
    expect(hook.current.range).toBe('30d');
    expect(hook.current.badges).toEqual([]); // no usage yet: no number it does not have
  });
});

describe('useLocalSessions and useApprovals', () => {
  it('looks only for an owner or operator', () => {
    renderHook(useLocalSessions, null);
    expect(optionsFor(['local-sessions']).enabled).toBe(false);
    renderHook(useLocalSessions, {
      ...operator,
      actor: { ...operator.actor, role: 'viewer' },
    } as never);
    expect(optionsFor(['local-sessions']).enabled).toBe(false);
    renderHook(useLocalSessions, operator as never);
    expect(optionsFor(['local-sessions']).enabled).toBe(true);
  });

  it('looks more often while something works, and only as a safety net while the stream is live', () => {
    renderHook(useLocalSessions, operator as never);
    const working = { sessions: [session({ hook: { activity: 'working' } })] };
    expect(interval(['local-sessions'], working)).toBe(4_000);
    expect(interval(['local-sessions'], { sessions: [session()] })).toBe(10_000);
    expect(interval(['local-sessions'], undefined)).toBe(10_000);
    useLink.setState({ status: 'live' });
    renderHook(useLocalSessions, operator as never);
    expect(interval(['local-sessions'], working)).toBe(30_000);
  });

  it('reads the sessions of the machine and tolerates an older server', async () => {
    renderHook(useLocalSessions, operator as never);
    answers['/api/local-sessions'] = { enabled: true };
    const result = (await optionsFor(['local-sessions']).queryFn!()) as { sessions: unknown[] };
    expect(result.sessions).toEqual([]);
  });

  it('counts only the approvals that wait, and only once there is a project', () => {
    renderHook(useApprovals, operator as never, undefined, false);
    expect(optionsFor(['approvals', undefined]).enabled).toBe(false);
    seed(['approvals', 'p1'], [{ state: 'pending' }, { state: 'approved' }, { state: 'pending' }]);
    const hook = renderHook(useApprovals, operator as never, 'p1', false);
    expect(hook.current.pending).toBe(2);
    // the project's stream refreshes it: asked for every few seconds only while that stream is down
    expect(optionsFor(['approvals', 'p1'])).toMatchObject({
      enabled: true,
      refetchInterval: 30_000,
    });
    renderHook(useApprovals, operator as never, 'p1', true);
    expect(optionsFor(['approvals', 'p1'])).toMatchObject({ refetchInterval: 5000 });
    expect(renderHook(useApprovals, null, 'p1', false).current.pending).toBe(2);
    expect(optionsFor(['approvals', 'p1']).enabled).toBe(false);
  });
});

describe('usePermissionRequests', () => {
  it('asks every few seconds, and only now and then once the server says Remote approvals is off', () => {
    renderHook(usePermissionRequests, true);
    expect(optionsFor(['permission-requests']).enabled).toBe(true);
    expect(interval(['permission-requests'], undefined)).toBe(2_500);
    expect(interval(['permission-requests'], { requests: [], enabled: true })).toBe(2_500);
    expect(interval(['permission-requests'], { requests: [], enabled: false })).toBe(30_000);
    expect(interval(['permission-requests'], { requests: [] })).toBe(2_500); // an older server does not say
    expect(interval(['permission-requests'], undefined, new Error('forbidden'))).toBe(false);
  });
});

describe('useAdoptRepos', () => {
  const unclaimed = (main: string, project = 'proj') =>
    session({ key: main, projectId: null, worktree: { main, project, root: main, linked: false } });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('gives each unclaimed repository a project once, owner only, and refreshes afterwards', async () => {
    const adopted = vi.fn();
    const sessions = [
      unclaimed('/repos/a', 'a'),
      unclaimed('/repos/a', 'a'),
      unclaimed('/tmp/scratch'),
      session(),
    ];
    const hook = renderHook(useAdoptRepos, sessions, true, adopted);
    await flush();
    expect(sent.map((s) => s.body)).toEqual([
      expect.objectContaining({ type: 'project.create', data: { name: 'a', root: '/repos/a' } }),
    ]);
    expect(adopted).toHaveBeenCalledTimes(1);
    hook.rerender([...sessions], true, adopted);
    await flush();
    expect(sent).toHaveLength(1); // adopted: not asked again
  });

  it('does nothing while disabled or before the sessions are known', async () => {
    renderHook(useAdoptRepos, [unclaimed('/repos/a')], false, vi.fn());
    renderHook(useAdoptRepos, undefined, true, vi.fn());
    await flush();
    expect(sent).toEqual([]);
  });
});

describe('character-session hooks', () => {
  it('knows who is signed in, and nobody before that', () => {
    expect(renderHook(useActor).current).toEqual({ id: '', role: '' });
    seed(['session'], operator);
    expect(renderHook(useActor).current).toEqual({ id: 'u1', role: 'operator' });
    expect(optionsFor(['session']).staleTime).toBe(Infinity);
  });

  it('reads the sessions the office last fetched without fetching them itself', () => {
    expect(renderHook(useCachedSessions).current).toEqual([]);
    expect(optionsFor(['local-sessions']).enabled).toBe(false);
    seed(['local-sessions'], { sessions: [session()] });
    expect(renderHook(useCachedSessions).current).toHaveLength(1);
  });

  describe('useTerminalState', () => {
    const drive = { terminalId: 't1', projectId: 'p1' };
    const state = (control: unknown, userId = 'u1') => {
      seed(['session-terminal', 'claude:a'], { terminal: drive });
      if (control) seed(['drive-terminal', 't1'], control);
      return renderHook(useTerminalState, session(), userId).current.state;
    };

    it('is none for a session that was not started in AETHER', () => {
      expect(renderHook(useTerminalState, session(), 'u1').current.state).toBe('none');
      expect(renderHook(useTerminalState, null, 'u1').current.state).toBe('none');
    });

    it('is free until the terminal says otherwise, then stopped or held', () => {
      expect(state(null)).toBe('free');
      expect(
        state({ state: 'running', controlOwner: null, controlEpoch: 1, leaseUntil: null }),
      ).toBe('free');
      expect(
        state({ state: 'exited', controlOwner: null, controlEpoch: 1, leaseUntil: null }),
      ).toBe('stopped');
      const lease = {
        state: 'running',
        controlOwner: 'other',
        controlEpoch: 1,
        leaseUntil: Date.now() + 60_000,
      };
      expect(state(lease)).toBe('held');
      expect(state({ ...lease, controlOwner: 'u1' })).toBe('free'); // my own lease
      expect(state({ ...lease, leaseUntil: Date.now() - 1 })).toBe('free'); // the lease ran out
    });
  });
});

describe('useContinue', () => {
  const profiles = (root = '/work/app') => ({
    profiles: [
      {
        machineId: 'm1',
        name: 'laptop',
        terminalProfiles: JSON.stringify([
          { name: 'codex-app', root },
          { name: 'claude-app', root },
        ]),
      },
    ],
  });
  const mount = (list: unknown, who = operator) => {
    resetQueries();
    seed(['session'], who);
    if (list) seed(['terminals', 'p1'], list);
    return renderHook(useContinue, session(), 'p1');
  };

  it('finds the profile that runs this session’s provider in its folder', () => {
    expect(mount(profiles()).current.target).toEqual({ machineId: 'm1', profile: 'claude-app' });
    expect(mount(profiles('/elsewhere')).current.target).toBeNull();
    expect(mount(null).current).toMatchObject({ loaded: false, target: null });
  });

  it('is allowed for owners and operators only', () => {
    expect(mount(profiles()).current.allowed).toBe(true);
    expect(
      mount(profiles(), { ...operator, actor: { ...operator.actor, role: 'viewer' } }).current
        .allowed,
    ).toBe(false);
  });

  it('starts a terminal that resumes the session, forked or not, and says what happened', async () => {
    const hook = mount(profiles());
    answers['/api/commands'] = { status: 'persisted', result: {} };
    const said = await hook.current.start(true);
    expect(said).toBe(hook.current.message);
    expect(said).toContain('Terminal started');
    expect(sent[0]!.body).toMatchObject({
      type: 'terminal.start',
      projectId: 'p1',
      data: {
        machineId: 'm1',
        profile: 'claude-app',
        cols: 100,
        rows: 30,
        resume: { provider: 'claude', sessionId: 'a', fork: true },
      },
    });
    expect(store.invalidated).toContainEqual(['terminals', 'p1']);
    expect(hook.current.busy).toBe(false);
  });

  it('reports a refusal instead of throwing, and does nothing without a profile', async () => {
    const hook = mount(profiles());
    installGlobal('fetch', () =>
      Promise.resolve(
        Response.json({ error: { code: 'LIVE_EXECUTION_NOT_ENABLED' } }, { status: 409 }),
      ),
    );
    const said = await hook.current.start(false);
    expect(said).toBe(hook.current.message);
    expect(said).not.toContain('Terminal started');
    expect(await mount(profiles('/elsewhere')).current.start(false)).toBe('');
  });
});
