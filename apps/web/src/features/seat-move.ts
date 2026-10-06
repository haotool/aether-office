import { useEffect, useRef, useState } from 'react';
import type { Layout } from '@aether/contracts';
import type { SeatMove } from '@aether/office-scene/model';
import { execute } from '../api.js';
import { LOCAL_PREFIX } from '../localSessions.js';

type Desk = Layout['objects'][number];

/**
 * Pure. The layout to save when a member's desk is dropped on a new seat, and the one that undoes it.
 *
 * A saved layout is changed by that one desk only (a member whose desk was seated automatically gets it written now); with
 * no saved layout yet the layout the person sees is what is saved, so nothing else jumps. Desks of sessions that are no
 * longer in the office are dropped, so remembered seats do not pile up and crowd out new sessions.
 */
export function seatMoveLayout({
  saved,
  shown,
  move,
  liveIds,
}: {
  saved: Layout | null;
  shown: Layout;
  move: SeatMove;
  liveIds: ReadonlySet<string>;
}): { next: Layout; previous: Layout } {
  const previous = saved ?? shown;
  const at = { x: move.to.x, z: move.to.z };
  const existing = previous.objects.find((o) => o.id === move.deskId);
  let objects: Desk[];
  if (existing && existing.agentId === move.agentId)
    objects = previous.objects.map((o) => (o === existing ? { ...o, ...at } : o));
  else {
    // The desk was seated automatically (or its id is taken by another member's saved desk): write it now, under a free id.
    const desk = shown.objects.find((o) => o.id === move.deskId)!;
    const used = new Set(previous.objects.map((o) => o.id));
    let id = desk.id;
    for (let n = 2; used.has(id); n++) id = `${desk.id}-${n}`;
    objects = [...previous.objects, { ...desk, ...at, id }];
  }
  const kept = objects.filter(
    (o) => !o.agentId?.startsWith(LOCAL_PREFIX) || liveIds.has(o.agentId),
  );
  return { next: { ...previous, objects: kept }, previous };
}

export type SeatToast = { text: string; undo: (() => void) | null };

/**
 * Saves a dropped desk through the layout API and offers to undo it. The moved layout is drawn at once and kept until the
 * saved one arrives (its version changes), or the save fails and it is dropped.
 */
export function useSeatMove({
  projectId,
  saved,
  version,
  shown,
  liveIds,
  onRefresh,
  words,
}: {
  projectId: string;
  saved: Layout | null;
  version: number;
  shown: Layout | null;
  liveIds: ReadonlySet<string>;
  onRefresh: () => void;
  words: { moved: string; undone: string; failed: string };
}) {
  const [optimistic, setOptimistic] = useState<Layout | null>(null);
  const [toast, setToast] = useState<SeatToast | null>(null);
  const versionRef = useRef(version);
  useEffect(() => {
    versionRef.current = version; // the saved layout arrived
    setOptimistic(null);
  }, [version]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  const save = async (layout: Layout, text: string, undo: (() => void) | null) => {
    setOptimistic(layout);
    try {
      const reply = await execute('layout.save', layout, projectId, versionRef.current);
      versionRef.current = Number(reply.result['version'] ?? versionRef.current + 1); // an undo right away needs the new one
      setToast({ text, undo });
      onRefresh();
    } catch (e) {
      setOptimistic(null);
      setToast({
        text: `${words.failed} ${e instanceof Error ? e.message : ''}`.trim(),
        undo: null,
      });
    }
  };
  const move = (m: SeatMove) => {
    if (!shown) return;
    const { next, previous } = seatMoveLayout({ saved, shown, move: m, liveIds });
    // The undo runs against the version the move produced: by then the page has refreshed.
    void save(next, words.moved, () => {
      setToast(null);
      void save(previous, words.undone, null);
    });
  };
  return { layout: optimistic, toast, dismiss: () => setToast(null), move };
}
