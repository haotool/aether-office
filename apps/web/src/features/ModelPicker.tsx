import { useState } from 'react';
import type { ModelCatalog } from '@aether/contracts';
import { Field, useT } from '../ui.js';
import { when } from './ClaudeQuota.js';
import { chipText } from './model-chip.js';

export type ModelChoice = { provider: ModelCatalog['provider']; id: string; effort?: string };
type OnChange = ((choice: ModelChoice) => void) | undefined;

export const SOURCE_NOTE = {
  cache: 'modelsSourceCache',
  cli: 'modelsSourceCli',
  fallback: 'modelsSourceFallback',
} as const;

/**
 * Model and effort choice, grouped by provider. Presentational: it shows what it is given and reports what is picked;
 * the effort list is only what the chosen model supports. Without `onChange` it is a read-only list.
 */
export function ModelPicker({
  catalogs,
  value,
  onChange,
  onRefresh,
  efforts = true,
}: {
  catalogs: ModelCatalog[];
  value?: ModelChoice;
  onChange?: (choice: ModelChoice) => void;
  onRefresh?: () => Promise<void>;
  /** Offer the effort list for the chosen model. False where the caller cannot apply an effort. */
  efforts?: boolean;
}) {
  const chosen = catalogs
    .find((c) => c.provider === value?.provider)
    ?.models.find((m) => m.id === value?.id);
  return (
    <div className="model-picker">
      {catalogs.map((catalog) => (
        <ModelGroup key={catalog.provider} catalog={catalog} value={value} onChange={onChange} />
      ))}
      {efforts && onChange && chosen && chosen.efforts.length > 0 && value && (
        <EffortField efforts={chosen.efforts} value={value} onChange={onChange} />
      )}
      {onRefresh && <RefreshButton onRefresh={onRefresh} />}
    </div>
  );
}

/** One provider's models as chips, with where the list came from. */
function ModelGroup({
  catalog,
  value,
  onChange,
}: {
  catalog: ModelCatalog;
  value: ModelChoice | undefined;
  onChange: OnChange;
}) {
  const t = useT();
  return (
    <section className="model-group" aria-label={catalog.provider}>
      <h3>{catalog.provider === 'claude' ? 'Claude' : 'Codex'}</h3>
      {catalog.models.length ? (
        <ul className="model-chips">
          {catalog.models.map((model) => {
            const selected = value?.provider === catalog.provider && value.id === model.id;
            return (
              <li key={model.id}>
                <button
                  type="button"
                  className={selected ? 'model-chip u-chip selected' : 'model-chip u-chip'}
                  aria-pressed={onChange ? selected : undefined}
                  disabled={!onChange}
                  title={model.isAlias ? t('modelsAlias') : model.id}
                  onClick={() => onChange?.({ provider: catalog.provider, id: model.id })}
                >
                  {chipText(model, selected ? (value.effort ?? model.defaultEffort) : undefined)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{t('modelsNone')}</p>
      )}
      <p className={catalog.stale ? 'muted model-note stale' : 'muted model-note'}>
        {t(SOURCE_NOTE[catalog.source])}
        {catalog.fetchedAt ? ` · ${when(catalog.fetchedAt)}` : ''}
        {catalog.stale && catalog.source !== 'fallback' ? ` · ${t('modelsStale')}` : ''}
      </p>
    </section>
  );
}

function EffortField({
  efforts,
  value,
  onChange,
}: {
  efforts: string[];
  value: ModelChoice;
  onChange: (choice: ModelChoice) => void;
}) {
  const t = useT();
  return (
    <Field label={t('modelsEffort')}>
      <select
        value={value.effort ?? ''}
        onChange={(e) => {
          const { effort: _previous, ...rest } = value;
          onChange(e.target.value ? { ...rest, effort: e.target.value } : rest);
        }}
      >
        <option value="">{t('modelsEffortDefault')}</option>
        {efforts.map((effort) => (
          <option key={effort} value={effort}>
            {effort}
          </option>
        ))}
      </select>
    </Field>
  );
}

function RefreshButton({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onRefresh();
        } catch {
          // The list on screen stays as it was; the next refresh may succeed.
        } finally {
          setBusy(false);
        }
      }}
    >
      {t('modelsRefresh')}
    </button>
  );
}
