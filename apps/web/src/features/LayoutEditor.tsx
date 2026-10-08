import type { Snapshot, Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { Modal } from '../ui/Modal.js';
import { Field } from '../ui/Field.js';
import { useT, useWhy } from '../ui/useT.js';
import {
  AddObjectButtons,
  DeskAssignment,
  LayoutFileTools,
  PlacementFields,
  SquadFields,
} from './LayoutEditorFields.js';
import { useLayoutEditor } from './use-layout-editor.js';

type Editor = ReturnType<typeof useLayoutEditor>;

/** Which floor, and which object on it, is being edited. */
function ObjectPicker({ editor }: { editor: Editor }) {
  const t = useT();
  const { draft, floor } = editor;
  return (
    <>
      <Field label={t('floor')}>
        <select value={floor} onChange={(e) => editor.selectFloor(Number(e.target.value))}>
          {DEPARTMENTS.map((d) => (
            <option key={d.id} value={d.floor}>
              {d.floor + 1}F · {t('floorName') === 'en' ? d.en : d.zh}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('object')}>
        <select value={editor.selected} onChange={(e) => editor.select(e.target.value)}>
          {draft.objects
            .filter((o) => (o.floor ?? 0) === floor)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {t(o.type)} · {o.id}
              </option>
            ))}
        </select>
      </Field>
    </>
  );
}

/** The fields of the chosen object, by what it is, and the button that removes it. */
function SelectedObject({ editor, agents }: { editor: Editor; agents: Snapshot['agents'] }) {
  const t = useT();
  const { draft, object } = editor;
  if (!object) return null;
  return (
    <>
      <PlacementFields object={object} patch={editor.patch} />
      {object.type === 'squad' && (
        <SquadFields squad={object} layout={draft} patch={editor.patch} />
      )}
      {object.type === 'desk' && (
        <DeskAssignment object={object} agents={agents} patch={editor.patch} />
      )}
      <button className="secondary danger" onClick={editor.remove}>
        {t('remove')}
      </button>
    </>
  );
}

function EditorFooter({ editor }: { editor: Editor }) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <div className="form-actions">
      <button className="secondary" onClick={editor.finish}>
        {t('cancel')}
      </button>
      <button
        className="primary"
        disabled={editor.busy}
        {...whyNot([!editor.busy, 'whyBusy'])}
        onClick={editor.save}
      >
        {editor.busy ? t('loading') : t('save')}
      </button>
    </div>
  );
}

type LayoutEditorProps = {
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
  onPreview: (layout: Layout | null) => void;
  /** Subagents working now, by their supervisor's member id: what "Pin current squad" sizes the zone for. */
  liveSquads?: Readonly<Record<string, number>>;
};

export function LayoutEditor({
  snapshot,
  onClose,
  onSaved,
  onPreview,
  liveSquads = {},
}: LayoutEditorProps) {
  const t = useT();
  const editor = useLayoutEditor({ snapshot, onClose, onSaved, onPreview, liveSquads });
  const { object } = editor;
  return (
    <Modal title={t('editLayoutExperimental')} onClose={editor.finish} dock>
      <div className="layout-editor">
        <LayoutFileTools
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onUndo={editor.undo}
          onRedo={editor.redo}
          onExport={editor.exportFile}
          onImport={editor.importFile}
        />
        <ObjectPicker editor={editor} />
        <SelectedObject editor={editor} agents={snapshot.agents} />
        <AddObjectButtons
          desk={object?.type === 'desk' ? object : undefined}
          live={editor.live}
          onSquad={editor.addSquad}
          onObject={editor.addObject}
        />
        {editor.error && (
          <p role="alert" className="error-text">
            {editor.error}
          </p>
        )}
        <EditorFooter editor={editor} />
      </div>
    </Modal>
  );
}
