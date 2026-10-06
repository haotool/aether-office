import { useEffect, useState } from 'react';
import type { Agent } from '@aether/contracts';
import {
  COMPACTION_LIVE_MS,
  type BranchInfo,
  type Pulse,
  type SceneCompaction,
  type ScreenFacts,
} from '@aether/office-scene/model';

/** A stand-in screen for the opt-in previews (`?intensity=`, `?compact=`): invented on purpose, never shown otherwise. */
export function standInFacts(
  agent: Pick<Agent, 'name' | 'role'>,
  provider: ScreenFacts['provider'],
  contextPercent: number | null,
): ScreenFacts {
  return {
    provider,
    title: `${agent.name} · ${agent.role}`,
    repo: 'preview',
    branch: 'main',
    ahead: 0,
    behind: 0,
    uncommitted: 3,
    model: null,
    contextPercent,
    state: 'working',
    tool: 'Edit',
    toolSince: Date.now(),
    recent: [
      { tool: 'Grep', target: null },
      { tool: 'Read', target: 'index.ts' },
      { tool: 'Edit', target: 'index.ts' },
      { tool: 'Bash', target: 'pnpm test' },
      { tool: 'Bash', target: 'git commit' },
      { tool: 'Edit', target: 'index.ts' },
    ],
    quietMinutes: 0,
    ports: [],
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
      agents.map((a, i) => [a.id, standInFacts(a, i % 2 ? 'codex' : 'claude', state.pct)]),
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
