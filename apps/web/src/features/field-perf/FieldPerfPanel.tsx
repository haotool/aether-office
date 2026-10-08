import { useId } from 'react';
import { FieldPerfManualCopy } from './FieldPerfManualCopy.js';
import { useFieldPerfPanel } from './use-field-perf-panel.js';

export function FieldPerfPanel() {
  const panel = useFieldPerfPanel();
  const statusId = useId();
  const copyReasonId = useId();

  return (
    <aside className="field-perf" aria-labelledby="field-perf-title">
      <h2 id="field-perf-title" className="field-perf__title">
        {panel.t('fieldPerfTitle')}
      </h2>
      <p className="field-perf__hint">
        {panel.t('fieldPerfHint')} {panel.t('fieldPerfPrivacy')}
      </p>
      <p className="field-perf__meta" aria-live="polite" id={statusId}>
        {panel.statusText} · {Math.floor(panel.elapsedMs / 1000)}s
      </p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {panel.copyAnnounce}
      </p>
      <p id={copyReasonId} className={panel.ready ? 'visually-hidden' : 'field-perf__copy-reason'}>
        {panel.copyDisabledReason}
      </p>
      <button
        type="button"
        className="field-perf__copy"
        disabled={!panel.ready}
        aria-describedby={panel.ready ? undefined : copyReasonId}
        title={panel.ready ? undefined : panel.copyDisabledReason}
        onClick={() => void panel.onCopy()}
      >
        {panel.copyState === 'ok' ? panel.t('fieldPerfCopied') : panel.t('fieldPerfCopy')}
      </button>
      {panel.copyState === 'manual' && panel.manualJson && (
        <FieldPerfManualCopy json={panel.manualJson} label={panel.t('fieldPerfCopyManual')} />
      )}
    </aside>
  );
}
