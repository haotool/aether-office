import type { Agent, Furniture, Layout, SquadObject } from '@aether/contracts';
import { squadCapacity } from '@aether/kernel';
import { Field } from '../../ui/Field.js';
import { useT, useWhy } from '../../ui/useT.js';
import type { PlainFurniture } from './layout-edit.js';
import { AgentOptions } from '../shell-chrome/panel-kit.js';

type Patch = (update: Partial<Furniture>) => void;

type SquadFieldsProps = {
  squad: SquadObject;
  layout: Layout;
  patch: Patch;
};

/** Undo, redo, export and import. */
export function LayoutFileTools({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
  onImport,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <div className="view-switch">
      <button disabled={!canUndo} {...whyNot([canUndo, 'whyNothingToUndo'])} onClick={onUndo}>
        {t('undo')}
      </button>
      <button disabled={!canRedo} {...whyNot([canRedo, 'whyNothingToRedo'])} onClick={onRedo}>
        {t('redo')}
      </button>
      <button onClick={onExport}>{t('export')}</button>
      <label className="secondary file-label">
        {t('import')}
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
          }}
        />
      </label>
    </div>
  );
}

/** Position and rotation of the selected object. */
export function PlacementFields({ object, patch }: { object: Furniture; patch: Patch }) {
  const t = useT();
  return (
    <div className="field-row">
      <Field label="X (m)">
        <input
          type="number"
          value={object.x}
          step="0.5"
          min="-24"
          max="24"
          onChange={(e) => patch({ x: Number(e.target.value) })}
        />
      </Field>
      <Field label="Z (m)">
        <input
          type="number"
          value={object.z}
          step="0.5"
          min="-16"
          max="16"
          onChange={(e) => patch({ z: Number(e.target.value) })}
        />
      </Field>
      <Field label={t('rotate')}>
        <select
          value={object.rotation}
          onChange={(e) => patch({ rotation: Number(e.target.value) })}
        >
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={i}>
              {i * 90}°
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/** A squad zone's desk anchor, width/depth and seats. */
export function SquadFields({ squad, layout, patch }: SquadFieldsProps) {
  const t = useT();
  const desks = layout.objects.filter(
    (o) => o.type === 'desk' && (o.floor ?? 0) === (squad.floor ?? 0),
  );
  return (
    <>
      <Field label={t('squadAnchor')}>
        <select value={squad.anchor} onChange={(e) => patch({ anchor: e.target.value })}>
          {desks.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id}
            </option>
          ))}
        </select>
      </Field>
      <div className="field-row">
        {([0, 1] as const).map((i) => (
          <Field key={i} label={`${i ? 'D' : 'W'} (m)`}>
            <input
              type="number"
              value={squad.span[i]}
              step="0.5"
              min={i ? 2.5 : 3}
              max={i ? 8 : 12}
              onChange={(e) =>
                patch({
                  span: i
                    ? [squad.span[0], Number(e.target.value)]
                    : [Number(e.target.value), squad.span[1]],
                } as Partial<SquadObject>)
              }
            />
          </Field>
        ))}
        <Field label={t('squadSeats')}>
          <input
            type="number"
            value={squad.seats}
            step="1"
            min="0"
            max={Math.min(12, squadCapacity(squad.span))}
            onChange={(e) => patch({ seats: Number(e.target.value) } as Partial<SquadObject>)}
          />
        </Field>
      </div>
    </>
  );
}

/** Which agent sits at a desk. */
export function DeskAssignment({
  object,
  agents,
  patch,
}: {
  object: Furniture;
  agents: readonly Agent[];
  patch: Patch;
}) {
  const t = useT();
  return (
    <Field label={t('assign')}>
      <select
        value={object.agentId ?? ''}
        onChange={(e) => patch({ agentId: e.target.value || null })}
      >
        <option value="">—</option>
        <AgentOptions agents={agents} />
      </select>
    </Field>
  );
}

/** Buttons that add a squad zone to the selected desk, or a new piece of furniture. */
export function AddObjectButtons({
  desk,
  live,
  onSquad,
  onObject,
}: {
  desk: Furniture | undefined;
  /** Subagents working now at that desk: "Pin current squad" sizes the zone for them. */
  live: number;
  onSquad: (desk: Furniture, count: number) => void;
  onObject: (type: PlainFurniture) => void;
}) {
  const t = useT();
  return (
    <div className="preset-buttons">
      {desk && (
        <button className="secondary" onClick={() => onSquad(desk, 4)}>
          {t('addSquad')}
        </button>
      )}
      {desk && live > 0 && (
        <button className="secondary" onClick={() => onSquad(desk, live)}>
          {t('pinSquad')}
        </button>
      )}
      {(['desk', 'plant', 'sofa', 'rack', 'table'] as const).map((type) => (
        <button className="secondary" key={type} onClick={() => onObject(type)}>
          {t('add')} {t(type)}
        </button>
      ))}
    </div>
  );
}
