import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttributedSession } from '@aether/contracts';
import type { LifeInput, LifePrefs, LifeSignal } from '@aether/office-scene/model';
import {
  deriveLifeSignals,
  emptyLifeMemory,
  KONAMI,
  konamiStep,
  type LifeSnapshot,
} from './life-signals.js';
import type { OfficeModel } from './office-model.js';
import { useLatest } from '../use-latest.js';
import { recordMoment } from './life-moments.js';
import { previewParams } from './scene-preview.js';

/** The newest signals kept for the scene: it only ever reads the last half minute. */
const KEEP = 60;
/** How many members a preview spreads its effects over. */
const PREVIEW_MEMBERS = 3;

/** The effects a `?preview=life&effect=a,b&t=1500` address asks for, read once: a preview does not change while the page lives. */
const previewAsked = previewParams(window.location.search);

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * What the 3D office needs for its little moments: the signals the change between scans makes, plus the viewer's own
 * (the Konami code), the settings, the names for the screen reader and, when the address asks, a contact sheet preview.
 * Nothing here decides an effect: the scene's scheduler does, from these.
 */
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
  }, [sessions, states, agentsNow, push]); // a new scan, or a member's state changed

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

  const names = useMemo(
    () => Object.fromEntries(model.agents.map((a) => [a.id, model.names[a.id]?.title ?? a.name])),
    [model.agents, model.names],
  );
  const idle = useMemo(
    () => model.agents.filter((a) => a.activity === 'idle').map((a) => a.id),
    [model.agents],
  );
  const memberKey = model.agents
    .slice(0, PREVIEW_MEMBERS)
    .map((a) => a.id)
    .join('|');
  const preview = useMemo(
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
  return {
    signals,
    prefs,
    names,
    onMoment: recordMoment,
    idle: preview ? model.agents.map((a) => a.id) : idle,
    ...(preview ? { preview } : {}),
  };
}
