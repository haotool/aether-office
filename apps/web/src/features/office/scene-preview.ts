import { useEffect, useState } from 'react';
import type { Agent } from '@aether/contracts';
import {
  COMPACTION_LIVE_MS,
  type BranchInfo,
  type Pulse,
  type SceneCompaction,
  type ScreenFacts,
} from '@aether/office-scene/model';

type Call = { tool: string; target: string | null };
const STAND_IN_WORK: { recent: Call[]; ports?: number[] }[] = [
  {
    recent: [
      { tool: 'Grep', target: null },
      { tool: 'Read', target: 'auth-service.ts' },
      { tool: 'Edit', target: 'auth-service.ts' },
    ],
  },
  {
    recent: [
      { tool: 'Edit', target: 'app.ts' },
      { tool: 'Bash', target: 'pnpm test' },
    ],
  },
  {
    recent: [
      { tool: 'Edit', target: 'router.go' },
      { tool: 'Bash', target: 'git diff' },
    ],
  },
  { recent: [{ tool: 'Bash', target: 'pnpm install' }] },
  {
    recent: [
      { tool: 'Read', target: 'README.md' },
      { tool: 'WebFetch', target: 'docs.example.com' },
    ],
  },
  {
    recent: [
      { tool: 'Read', target: 'plan.md' },
      { tool: 'Task', target: null },
    ],
  },
  {
    recent: [
      { tool: 'Read', target: 'guide.md' },
      { tool: 'Edit', target: 'guide.md' },
    ],
  },
  {
    recent: [
      { tool: 'Read', target: 'train_model.py' },
      { tool: 'Edit', target: 'train_model.py' },
    ],
  },
  {
    recent: [
      { tool: 'Read', target: 'button.css' },
      { tool: 'Edit', target: 'button.css' },
    ],
  },
  { recent: [{ tool: 'Edit', target: 'OrderService.java' }] },
  {
    recent: [
      { tool: 'Read', target: 'lib.rs' },
      { tool: 'Edit', target: 'lib.rs' },
    ],
  },
  {
    recent: [
      { tool: 'Edit', target: 'schema.sql' },
      { tool: 'Bash', target: 'pnpm build' },
    ],
  },
  {
    recent: [
      { tool: 'Edit', target: 'Dockerfile.yml' },
      { tool: 'Bash', target: 'docker build' },
    ],
  },
  {
    recent: [
      { tool: 'Edit', target: 'index.ts' },
      { tool: 'Bash', target: 'git status' },
    ],
  },
  {
    recent: [
      { tool: 'Edit', target: 'server.js' },
      { tool: 'Bash', target: 'node server.js' },
    ],
    ports: [3000],
  },
  {
    recent: [
      { tool: 'Read', target: 'deploy.sh' },
      { tool: 'Edit', target: 'deploy.sh' },
    ],
  },
  {
    recent: [
      { tool: 'Grep', target: null },
      { tool: 'Read', target: 'config.json' },
      { tool: 'Edit', target: 'config.json' },
    ],
  },
  {
    recent: [
      { tool: 'Edit', target: 'Panel.tsx' },
      { tool: 'Edit', target: 'Panel.test.tsx' },
      { tool: 'Bash', target: 'vitest' },
    ],
  },
];

const STAND_IN_ROLES = [
  'frontend',
  'qa',
  'data',
  'sre',
  'docs',
  'security',
  'product-manager',
  'ml',
  'backend',
  'release',
  'architect',
  'review',
  'analytics',
  'platform',
  'research',
  'mobile',
  'fullstack',
  'generalist',
];
export const standInRole = (index: number): string => {
  const role = STAND_IN_ROLES[index % STAND_IN_ROLES.length];
  if (role === undefined) throw new Error('stand-in role index');
  return role;
};

const nameHash = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function standInFacts(
  agent: Pick<Agent, 'name' | 'role'>,
  provider: ScreenFacts['provider'],
  contextPercent: number | null,
  index = 0,
): ScreenFacts {
  const hash = nameHash(agent.name);
  const work = STAND_IN_WORK[index % STAND_IN_WORK.length];
  if (!work) throw new Error('stand-in work index');
  const last = work.recent.at(-1);
  if (!last) throw new Error('stand-in work missing recent tool');
  return {
    provider,
    title: `${agent.name} · ${agent.role}`,
    repo: 'preview',
    branch: hash % 3 ? 'main' : 'feat/preview',
    ahead: hash % 4,
    behind: 0,
    uncommitted: 3,
    model: null,
    contextPercent,
    state: 'working',
    tool: last.tool,
    toolSince: Date.now() - (hash % 9000),
    recent: work.recent,
    quietMinutes: 0,
    ports: work.ports ?? [],
  };
}

const HIGH = 88;
const LOW = 24;
const PERIOD_MS = 8000;
const FILL_LEAD_MS = 900;

export function useCompactPreview(agents: readonly Agent[], enabled: boolean) {
  const [state, setState] = useState<{ pct: number; event: SceneCompaction | null }>({
    pct: HIGH,
    event: null,
  });
  useEffect(() => {
    if (!enabled) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const cycle = () => {
      setState({ pct: HIGH, event: null });
      timers.add(
        setTimeout(() => {
          setState({ pct: LOW, event: { key: Date.now(), fromPct: HIGH, toPct: LOW } });
          timers.add(
            setTimeout(() => setState((s) => ({ ...s, event: null })), COMPACTION_LIVE_MS),
          );
        }, FILL_LEAD_MS),
      );
    };
    cycle();
    const every = setInterval(cycle, PERIOD_MS);
    return () => {
      clearInterval(every);
      timers.forEach(clearTimeout);
    };
  }, [enabled]);
  if (!enabled) return null;
  return {
    screens: Object.fromEntries(
      agents.map((a, i) => [a.id, standInFacts(a, i % 2 ? 'codex' : 'claude', state.pct, i)]),
    ),
    compactions: state.event
      ? Object.fromEntries(agents.map((a) => [a.id, state.event as SceneCompaction]))
      : {},
  };
}

const TALK_PERIOD_MS = 7000;
const KINDS = ['inform', 'request', 'decision', 'handoff'] as const;

const previewAgentAt = (agents: readonly Agent[], i: number): Agent => {
  const agent = agents[i % agents.length];
  if (!agent) throw new Error('talk preview agent index');
  return agent;
};

const talkPulseKind = (step: number) => {
  const kind = KINDS[step % KINDS.length];
  if (kind === undefined) throw new Error('talk preview pulse kind');
  return kind;
};

export function useTalkPreview(agents: readonly Agent[], enabled: boolean) {
  const [step, setStep] = useState(0);
  const [started] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setStep(1);
    const every = setInterval(() => setStep((n) => n + 1), TALK_PERIOD_MS);
    return () => clearInterval(every);
  }, [enabled]);
  if (!enabled || agents.length < 4) return null;
  const pair = (n: number) =>
    [previewAgentAt(agents, 2 * n), previewAgentAt(agents, 2 * n + 1)] as const;
  const pulses: Pulse[] = step
    ? (() => {
        const [from, to] = pair(step - 1);
        return [
          {
            id: `talk:${step}`,
            from: from.id,
            to: to.id,
            kind: talkPulseKind(step),
            at: started + (step - 1) * TALK_PERIOD_MS + 1000,
          },
        ];
      })()
    : [];
  const byId = new Map(agents.map((a, i) => [a.id, i]));
  return {
    pulses,
    tethers: [
      { parent: previewAgentAt(agents, 0).id, child: previewAgentAt(agents, 1).id },
      { parent: previewAgentAt(agents, 0).id, child: previewAgentAt(agents, 2).id },
    ],
    branchOf: (agent: Agent): BranchInfo => ({
      repo: (byId.get(agent.id) ?? 0) % 2 ? 'billing-api' : 'aether',
      branch: 'main',
      linked: false,
      dirty: 0,
      ahead: 0,
      behind: 0,
    }),
    attention: {
      [previewAgentAt(agents, 4).id]: 'preview',
      [previewAgentAt(agents, 7).id]: 'preview',
    } as Record<string, string>,
  };
}
