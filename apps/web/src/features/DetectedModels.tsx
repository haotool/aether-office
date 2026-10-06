import { useT } from '../ui.js';
import { ModelPicker } from './ModelPicker.js';
import { useModels } from './useModels.js';

/** Settings → Execution: the models the CLIs on this machine offer, read-only. */
export function DetectedModels() {
  const t = useT();
  const { catalogs, error, loading, refresh } = useModels();
  return (
    <section className="settings-panel panel">
      <h2>{t('modelsDetected')}</h2>
      <p className="muted">{t('modelsNote')}</p>
      {error && <p role="alert">{error.message}</p>}
      {loading && <p>{t('loading')}</p>}
      {catalogs && <ModelPicker catalogs={catalogs} onRefresh={refresh} />}
    </section>
  );
}
