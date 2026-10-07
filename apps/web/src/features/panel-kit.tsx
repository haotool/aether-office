import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Agent } from '@aether/contracts';
import { Field, useT, whyNot } from '../ui.js';

/** Props of the project panels that list agents (rooms, meetings). */
export type AgentPanelProps = {
  projectId: string;
  agents: readonly Agent[];
  canManage: boolean;
};

type QueryKey = readonly unknown[];

/**
 * Runs one command for a project panel: clears the last error, shows a new one, and refreshes the listed queries.
 * `refreshOnFailure` also refreshes after a failure (the server may have moved on); otherwise only after success.
 */
export function useCommandRunner(keys: readonly QueryKey[], refreshOnFailure: boolean) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const refresh = async () => {
    for (const queryKey of keys) await client.invalidateQueries({ queryKey });
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      if (!refreshOnFailure) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      if (refreshOnFailure) await refresh();
    }
  };
  return { error, run };
}

/** The enable/disable button of a listed item; it needs the owner. */
export function EnableToggle({
  enabled,
  canManage,
  onToggle,
}: {
  enabled: boolean;
  canManage: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button disabled={!canManage} {...whyNot(canManage, t('needOwner'))} onClick={onToggle}>
      {enabled ? t('scheduleDisable') : t('scheduleEnable')}
    </button>
  );
}

/** A required multi-select of agents, submitted under `name`. */
export function AgentPicker({
  name,
  label,
  agents,
}: {
  name: string;
  label: string;
  agents: readonly Agent[];
}) {
  return (
    <Field label={label}>
      <select name={name} multiple required size={Math.min(6, Math.max(2, agents.length))}>
        <AgentOptions agents={agents} />
      </select>
    </Field>
  );
}

/** One `<option>` per agent, valued by its id. */
export function AgentOptions({ agents }: { agents: readonly Agent[] }) {
  return (
    <>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </>
  );
}
