import type { LocalSession, Subagent } from '@aether/contracts';
import type { HookState } from '../hooks/hook-spool.js';
import type { Raw } from './session-discovery.js';
import { mergeSubagents, readSubagentTranscripts } from '../subagents/subagent-transcripts.js';
import type { ReadBudget } from '../subagents/subagent-usage.js';
import { readOutcomes, type Outcomes } from '../runtime/tool-outcomes.js';

/** What one session's own files add to its hook state: tool outcomes and the subagents (hook, transcript and rollout). */
export type SessionSignals = {
  subagents: Subagent[];
  recent: NonNullable<LocalSession['hook']>['recent'];
};

/**
 * Pure join of what is known about a session's tool calls: the hook's call list (with the outcome the hook reported)
 * gets the transcript's outcome for the calls the hook could not settle, matched by the provider's tool id only.
 */
function withOutcomes(
  calls: HookState['recent'],
  outcomes: Outcomes,
): NonNullable<LocalSession['hook']>['recent'] {
  return calls.map(({ toolUseId, ...call }) => ({
    ...call,
    ok: call.ok ?? (toolUseId ? (outcomes.get(toolUseId) ?? null) : null),
  }));
}

export async function readSessionSignals(
  raw: Raw,
  hook: HookState | undefined,
  now: number,
  budget: ReadBudget,
): Promise<SessionSignals> {
  // The transcript's tail is read only when something needs it, and once per session per look.
  let outcomes: Promise<Outcomes> | null = null;
  const load = () => (outcomes ??= readOutcomes(raw.provider, raw.file));
  const unsettled = (hook?.recent ?? []).some((c) => c.ok === null && c.toolUseId);
  const calls = hook?.recent ?? [];
  const hooked = hook?.subagents ?? [];
  const files =
    raw.provider === 'claude'
      ? await readSubagentTranscripts(raw.file, now, {
          outcomes: load,
          finished: new Set(hooked.filter((c) => c.status === 'finished').map((c) => c.id)),
          budget,
        })
      : [];
  return {
    subagents: mergeSubagents(hooked, files, raw.children ?? []),
    recent: withOutcomes(calls, unsettled ? await load() : new Map()),
  };
}
