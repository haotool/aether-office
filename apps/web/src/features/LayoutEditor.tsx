import { uuid } from '../browser-compat.js';
import { useState } from 'react';
import type { Snapshot, Layout, Furniture, SquadObject } from '@aether/contracts';
import { layoutSchema } from '@aether/contracts';
import { defaultLayout, squadLayout, squadObjectOf } from '@aether/office-scene/model';
import { DEPARTMENTS, layoutVersionOf, squadCapacity } from '@aether/kernel';
import { floorResolver } from '../localSessions.js';
import { execute } from '../api.js';
import { Modal, Field, useT } from '../ui.js';
export function LayoutEditor({
  snapshot,
  onClose,
  onSaved,
  onPreview,
  liveSquads = {},
}: {
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
  onPreview: (layout: Layout | null) => void;
  /** Subagents working now, by their supervisor's member id: what "Pin current squad" sizes the zone for. */
  liveSquads?: Readonly<Record<string, number>>;
}) {
  const t = useT();
  const [floor, setFloor] = useState(0);
  const [history, setHistory] = useState<Layout[]>([
    snapshot.layout?.data ?? defaultLayout(snapshot.agents, floorResolver([])),
  ]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(history[0]!.objects.find((o) => !o.floor)?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const draft = history[index]!;
  const object = draft.objects.find((o) => o.id === selected);
  // The file is version 2 only while it holds a squad zone, so a layout without one stays readable by an older build.
  const change = (layout: Layout) => {
    const next = { ...layout, schemaVersion: layoutVersionOf(layout.objects) };
    setHistory([...history.slice(0, index + 1), next]);
    setIndex(index + 1);
    onPreview(next);
  };
  const patch = (update: Partial<Furniture>) =>
    change({
      ...draft,
      objects: draft.objects.map((o) =>
        o.id === selected ? ({ ...o, ...update } as Furniture) : o,
      ),
    });
  const addSquad = (desk: Furniture, count: number) => {
    const zone = draft.objects.find((o) => o.type === 'squad' && o.anchor === desk.id);
    const rect = zone ? null : squadLayout(draft, desk.id, count);
    if (!zone && !rect) return setError(t('squadNoRoom'));
    setError('');
    if (zone) return setSelected(zone.id);
    const id = `squad-${uuid().slice(0, 6)}`;
    change({ ...draft, objects: [...draft.objects, squadObjectOf(rect!, id)] });
    setSelected(id);
  };
  const squad = object?.type === 'squad' ? object : null;
  const live = object?.agentId ? (liveSquads[object.agentId] ?? 0) : 0;
  const finish = () => {
    onPreview(null);
    onClose();
  };
  return (
    <Modal title={t('editLayout')} onClose={finish}>
      <div className="layout-editor">
        <div className="view-switch">
          <button
            disabled={!index}
            onClick={() => {
              setIndex(index - 1);
              onPreview(history[index - 1]!);
            }}
          >
            {t('undo')}
          </button>
          <button
            disabled={index >= history.length - 1}
            onClick={() => {
              setIndex(index + 1);
              onPreview(history[index + 1]!);
            }}
          >
            {t('redo')}
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'aether-layout.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {t('export')}
          </button>
          <label className="secondary file-label">
            {t('import')}
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 128000) throw new Error('LAYOUT_FILE_TOO_LARGE');
                  change(layoutSchema.parse(JSON.parse(await file.text())));
                  setError('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'INVALID_LAYOUT');
                }
              }}
            />
          </label>
        </div>
        <Field label={t('floor')}>
          <select
            value={floor}
            onChange={(e) => {
              const next = Number(e.target.value);
              setFloor(next);
              setSelected(draft.objects.find((o) => (o.floor ?? 0) === next)?.id ?? '');
            }}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.floor}>
                {d.floor + 1}F · {t('floorName') === 'en' ? d.en : d.zh}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('object')}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {draft.objects
              .filter((o) => (o.floor ?? 0) === floor)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {t(o.type)} · {o.id}
                </option>
              ))}
          </select>
        </Field>
        {object && (
          <>
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
            {squad && (
              <>
                <Field label={t('squadAnchor')}>
                  <select value={squad.anchor} onChange={(e) => patch({ anchor: e.target.value })}>
                    {draft.objects
                      .filter((o) => o.type === 'desk' && (o.floor ?? 0) === (squad.floor ?? 0))
                      .map((o) => (
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
                      onChange={(e) =>
                        patch({ seats: Number(e.target.value) } as Partial<SquadObject>)
                      }
                    />
                  </Field>
                </div>
              </>
            )}
            {object.type === 'desk' && (
              <Field label={t('assign')}>
                <select
                  value={object.agentId ?? ''}
                  onChange={(e) => patch({ agentId: e.target.value || null })}
                >
                  <option value="">—</option>
                  {snapshot.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <button
              className="secondary danger"
              onClick={() =>
                change({
                  ...draft,
                  // a squad zone goes with its desk
                  objects: draft.objects.filter(
                    (o) => o.id !== selected && !(o.type === 'squad' && o.anchor === selected),
                  ),
                })
              }
            >
              {t('remove')}
            </button>
          </>
        )}
        <div className="preset-buttons">
          {object?.type === 'desk' && (
            <button className="secondary" onClick={() => addSquad(object, 4)}>
              {t('addSquad')}
            </button>
          )}
          {object?.type === 'desk' && live > 0 && (
            <button className="secondary" onClick={() => addSquad(object, live)}>
              {t('pinSquad')}
            </button>
          )}
          {(['desk', 'plant', 'sofa', 'rack', 'table'] as const).map((type) => (
            <button
              className="secondary"
              key={type}
              onClick={() => {
                const id = `${type}-${uuid().slice(0, 6)}`;
                change({
                  ...draft,
                  objects: [
                    ...draft.objects,
                    { id, type, x: 5, z: 5, rotation: 0, agentId: null, floor },
                  ],
                });
                setSelected(id);
              }}
            >
              {t('add')} {t(type)}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="secondary" onClick={finish}>
            {t('cancel')}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await execute(
                  'layout.save',
                  draft,
                  snapshot.project.id,
                  snapshot.layout?.version ?? 0,
                );
                onSaved();
                finish();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'SAVE_FAILED');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t('loading') : t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
