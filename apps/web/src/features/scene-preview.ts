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
/** What a stand-in member is doing: its recent calls, the last of which is the one running. */
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

/** The roles a preview's members go through in turn, so each role's habits (a QA desk, a data desk) show up. */
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
export const standInRole = (index: number): string =>
  STAND_IN_ROLES[index % STAND_IN_ROLES.length]!;

const nameHash = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A stand-in screen for the opt-in previews (`?intensity=`, `?compact=`): invented on purpose, never shown otherwise. It varies by member so the desks differ. */

/** What a deterministic effect preview asks for: draw this effect as it looks `t` ms after it started. */
export type PreviewParams = { effect: string; t: number };

const EFFECT_ID = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * `?preview=life&effect=<id>&t=<ms>`: the address of one frame of one office-life effect, so a contact sheet can render
 * every effect at fixed times. Null when the address is not a preview or names no valid effect. `t` defaults to 0 and
 * must be a whole number of milliseconds (anything else is rejected, not rounded, so a sheet never shows a wrong frame).
 * Accepts a full URL, a path with a query, or just a query string.
 */
export function previewParams(url: string): PreviewParams | null {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : url;
  const params = new URLSearchParams(query.split('#')[0]);
  const effect = params.get('effect');
  if (params.get('preview') !== 'life' || effect === null || !EFFECT_ID.test(effect)) return null;
  const raw = params.get('t');
  if (raw === null) return { effect, t: 0 };
  return /^\d{1,7}$/.test(raw) ? { effect, t: Number(raw) } : null;
}

/** A stand-in screen for the opt-in previews (`?intensity=`, `?compact=`): invented on purpose, never shown otherwise. */
export function standInFacts(
  agent: Pick<Agent, 'name' | 'role'>,
  provider: ScreenFacts['provider'],
  contextPercent: number | null,
  /** The member's place in the office: members in a row go through the scenarios in turn, so every kind of desk shows up. */
  index = 0,
): ScreenFacts {
  const hash = nameHash(agent.name);
  const work = STAND_IN_WORK[index % STAND_IN_WORK.length]!;
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
    tool: work.recent[work.recent.length - 1]!.tool,
    toolSince: Date.now() - (hash % 9000),
    recent: work.recent,
    quietMinutes: 0,
    ports: work.ports ?? [],
  };
}

const HIGH = 88;
const LOW = 24;
/** The preview fills every member's context, then compacts it, once every `period` ms. */
const PERIOD_MS = 8000;
const FILL_LEAD_MS = 900;

/**
 * `?compact=1`: every member gets a stand-in screen whose context fills to a high share and, a moment later, is compacted
 * (88% to 24%), over and over, so the gauge, the effect and the chip can be looked at without a long real session.
 * Returns what the scene gets: the stand-in screens and the compaction happening now (null while `enabled` is false).
 */
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

/**
 * `?talk=1`: stand-in traffic to look at how members react to each other without real sessions: a message between the
 * next pair every few seconds (they turn to each other, an envelope crosses, the receiver nods), the first member as the
 * parent of the next two (tethers), members alternating between two repositories (threads, on hover) and two members that
 * want a person (the ring on the floor). Null while `enabled` is false.
 */
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
    [agents[(2 * n) % agents.length]!, agents[(2 * n + 1) % agents.length]!] as const;
  const pulses: Pulse[] = step
    ? [
        (() => {
          const [from, to] = pair(step - 1);
          return {
            id: `talk:${step}`,
            from: from.id,
            to: to.id,
            kind: KINDS[step % KINDS.length]!,
            at: started + (step - 1) * TALK_PERIOD_MS + 1000,
          };
        })(),
      ]
    : [];
  const byId = new Map(agents.map((a, i) => [a.id, i]));
  return {
    pulses,
    tethers: [
      { parent: agents[0]!.id, child: agents[1]!.id },
      { parent: agents[0]!.id, child: agents[2]!.id },
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
      [agents[4 % agents.length]!.id]: 'preview',
      [agents[7 % agents.length]!.id]: 'preview',
    } as Record<string, string>,
  };
}
