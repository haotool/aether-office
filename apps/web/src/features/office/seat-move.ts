import { useEffect, useRef, useState } from 'react';
import type { Layout } from '@aether/contracts';
import type { SeatMove } from '@aether/office-scene/model';
import { execute } from '../../lib/api/api-commands.js';
import { LOCAL_PREFIX } from '../../lib/sessions/session-names.js';

type Desk = Layout['objects'][number];

/**
 * A saved layout is changed by that one desk only; with no saved layout the layout the person sees is saved, so nothing
 * else jumps. Desks of sessions no longer in the office are dropped, so remembered seats do not pile up.
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
    const desk = shown.objects.find((o) => o.id === move.deskId);
    if (!desk) throw new Error('seat move: desk missing from shown layout');
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

type SeatMoveOptions = {
  projectId: string;
  saved: Layout | null;
  version: number;
  shown: Layout | null;
  liveIds: ReadonlySet<string>;
  onRefresh: () => void;
  words: { moved: string; undone: string; failed: string };
};

export function useSeatMove({
  projectId,
  saved,
  version,
  shown,
  liveIds,
  onRefresh,
  words,
}: SeatMoveOptions) {
  const [optimistic, setOptimistic] = useState<Layout | null>(null);
  const [toast, setToast] = useState<SeatToast | null>(null);
  const versionRef = useRef(version);
  useEffect(() => {
    versionRef.current = version;
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
      versionRef.current = Number(reply.result['version'] ?? versionRef.current + 1);
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
    void save(next, words.moved, () => {
      setToast(null);
      void save(previous, words.undone, null);
    });
  };
  return { layout: optimistic, toast, dismiss: () => setToast(null), move };
}
