import { useState } from 'react';
import type { Furniture, Layout, Snapshot } from '@aether/contracts';
import { layoutSchema } from '@aether/contracts';
import { defaultLayout, squadLayout, squadObjectOf } from '@aether/office-scene/model';
import { layoutVersionOf } from '@aether/kernel';
import { uuid } from '../../lib/platform/browser-compat.js';
import { execute } from '../../lib/api/api-commands.js';
import { floorResolver } from '../../lib/sessions/localSessions.js';
import { useT } from '../../ui/useT.js';
import { withoutObject, withPatchedObject, type PlainFurniture } from '../office/layout-edit.js';

const MAX_LAYOUT_FILE_BYTES = 128000;

/** Offers the layout as a JSON file download. */
function downloadLayout(layout: Layout) {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aether-layout.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads and validates an imported layout file. */
async function readLayoutFile(file: File): Promise<Layout> {
  if (file.size > MAX_LAYOUT_FILE_BYTES) throw new Error('LAYOUT_FILE_TOO_LARGE');
  return layoutSchema.parse(JSON.parse(await file.text()));
}

type EditorProps = {
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
  onPreview: (layout: Layout | null) => void;
  liveSquads: Readonly<Record<string, number>>;
};

/** The undo history of the draft: every change is a new entry (and drops what was undone), and it is previewed live. */
function useLayoutHistory(initial: Layout, onPreview: (layout: Layout | null) => void) {
  const [history, setHistory] = useState<Layout[]>([initial]);
  const [index, setIndex] = useState(0);
  // The file is version 2 only while it holds a squad zone, so a layout without one stays readable by an older build.
  const change = (layout: Layout) => {
    const next = { ...layout, schemaVersion: layoutVersionOf(layout.objects) };
    setHistory([...history.slice(0, index + 1), next]);
    setIndex(index + 1);
    onPreview(next);
  };
  const goTo = (to: number) => {
    setIndex(to);
    onPreview(history[to] ?? initial);
  };
  return {
    draft: history[index] ?? initial,
    index,
    change,
    goTo,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}

/** Saves the draft at the project's current layout version; `onDone` runs once it is in, the error says why not. */
function useSaveLayout(
  snapshot: Snapshot,
  draft: Layout,
  setError: (message: string) => void,
  onDone: () => void,
) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await execute('layout.save', draft, snapshot.project.id, snapshot.layout?.version ?? 0);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SAVE_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

/** Adds a piece of furniture, or a squad zone beside a desk (or selects the one that is already there). */
function useAddObjects(
  draft: Layout,
  change: (layout: Layout) => void,
  floor: number,
  setSelected: (id: string) => void,
  setError: (message: string) => void,
) {
  const t = useT();
  const addObject = (type: PlainFurniture) => {
    const id = `${type}-${uuid().slice(0, 6)}`;
    const added = { id, type, x: 5, z: 5, rotation: 0, agentId: null, floor };
    change({ ...draft, objects: [...draft.objects, added] });
    setSelected(id);
  };
  const addSquad = (desk: Furniture, count: number) => {
    const zone = draft.objects.find((o) => o.type === 'squad' && o.anchor === desk.id);
    if (zone) {
      setError('');
      return setSelected(zone.id);
    }
    const rect = squadLayout(draft, desk.id, count);
    if (!rect) return setError(t('squadNoRoom'));
    setError('');
    const id = `squad-${uuid().slice(0, 6)}`;
    change({ ...draft, objects: [...draft.objects, squadObjectOf(rect, id)] });
    setSelected(id);
  };
  return { addObject, addSquad };
}

/** Reads a layout file into the draft as a new history entry; the error says why a file was refused. */
function useImportFile(change: (layout: Layout) => void, setError: (message: string) => void) {
  return async (file: File) => {
    try {
      change(await readLayoutFile(file));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'INVALID_LAYOUT');
    }
  };
}

/** The layout editor's state and actions: the undo history, the selection, and save/import/export. */
export function useLayoutEditor(props: EditorProps) {
  const { snapshot, onClose, onSaved, onPreview, liveSquads } = props;
  const [initial] = useState(
    () => snapshot.layout?.data ?? defaultLayout(snapshot.agents, floorResolver([])),
  );
  const [floor, setFloor] = useState(0);
  const { draft, index, change, canUndo, canRedo, goTo } = useLayoutHistory(initial, onPreview);
  const [selected, setSelected] = useState(initial.objects.find((o) => !o.floor)?.id ?? '');
  const [error, setError] = useState('');
  const object = draft.objects.find((o) => o.id === selected);
  const finish = () => {
    onPreview(null);
    onClose();
  };
  const importFile = useImportFile(change, setError);
  const { addObject, addSquad } = useAddObjects(draft, change, floor, setSelected, setError);
  const { busy, save } = useSaveLayout(snapshot, draft, setError, () => {
    onSaved();
    finish();
  });
  return {
    floor,
    draft,
    object,
    selected,
    error,
    busy,
    canUndo,
    canRedo,
    live: object?.agentId ? (liveSquads[object.agentId] ?? 0) : 0,
    select: setSelected,
    selectFloor: (next: number) => {
      setFloor(next);
      setSelected(draft.objects.find((o) => (o.floor ?? 0) === next)?.id ?? '');
    },
    undo: () => goTo(index - 1),
    redo: () => goTo(index + 1),
    exportFile: () => downloadLayout(draft),
    patch: (update: Partial<Furniture>) => change(withPatchedObject(draft, selected, update)),
    remove: () => change(withoutObject(draft, selected)),
    importFile,
    addObject,
    addSquad,
    save,
    finish,
  };
}
