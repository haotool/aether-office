import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttributedSession } from '@aether/contracts';
import type { LifeInput, LifePrefs, LifeSignal } from '@aether/office-scene/model';
import {
  deriveLifeSignals,
  emptyLifeMemory,
  KONAMI,
  konamiStep,
  type LifeSnapshot,
} from '../office/life-signals.js';
import type { OfficeModel } from '../office/office-model.js';
import { useLatest } from '../../hooks/use-latest.js';
import { recordMoment } from '../feed/life-moments.js';
import { previewParams } from '../office/scene-preview.js';

const KEEP = 60;
const PREVIEW_MEMBERS = 3;

const previewAsked = previewParams(window.location.search);

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

function useKonami(push: (more: readonly LifeSignal[]) => void) {
  useEffect(() => {
    let progress = 0;
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      progress = konamiStep(progress, event.key);
      if (progress < KONAMI.length) return;
      progress = 0;
      push([{ kind: 'ui.konami', member: null, at: Date.now() }]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [push]);
}

function useMemberNames(model: OfficeModel) {
  const names = useMemo(
    () => Object.fromEntries(model.agents.map((a) => [a.id, model.names[a.id]?.title ?? a.name])),
    [model.agents, model.names],
  );
  const idle = useMemo(
    () => model.agents.filter((a) => a.activity === 'idle').map((a) => a.id),
    [model.agents],
  );
  return { names, idle };
}

function usePreviewInput(model: OfficeModel) {
  const memberKey = model.agents
    .slice(0, PREVIEW_MEMBERS)
    .map((a) => a.id)
    .join('|');
  return useMemo(
    () =>
      previewAsked
        ? {
            effects: previewAsked.effect.split(','),
            t: previewAsked.t,
            ...(previewAsked.loop ? { loop: true as const } : {}),
            members: memberKey ? memberKey.split('|') : [],
          }
        : undefined,
    [memberKey],
  );
}

export function useLifeInput(
  sessions: readonly AttributedSession[],
  model: OfficeModel,
  prefs: LifePrefs,
): LifeInput {
  const [signals, setSignals] = useState<readonly LifeSignal[]>([]);
  const previous = useRef<LifeSnapshot | null>(null);
  const memory = useRef(emptyLifeMemory);
  const push = useCallback(
    (more: readonly LifeSignal[]) => setSignals((now) => [...now, ...more].slice(-KEEP)),
    [],
  );
  const agentsNow = useLatest(model.agents);
  const states = model.agents.map((a) => `${a.id}:${a.activity}`).join('|');

  useEffect(() => {
    const snapshot: LifeSnapshot = { at: Date.now(), sessions, agents: agentsNow.current };
    const next = deriveLifeSignals(previous.current, snapshot, memory.current);
    previous.current = snapshot;
    memory.current = next.memory;
    if (next.signals.length) push(next.signals);
  }, [sessions, states, agentsNow, push]);

  useKonami(push);

  const { names, idle } = useMemberNames(model);
  const preview = usePreviewInput(model);
  return {
    signals,
    prefs,
    names,
    onMoment: recordMoment,
    idle: preview ? model.agents.map((a) => a.id) : idle,
    ...(preview ? { preview } : {}),
  };
}
