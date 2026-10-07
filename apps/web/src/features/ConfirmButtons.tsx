import { useT } from '../ui.js';

/** A confirm dialog's failure line and its two buttons: the confirmation (busy while it runs) and Cancel. */
export function ConfirmButtons({
  error,
  busy,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  error: string;
  busy: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="primary" disabled={busy} onClick={onConfirm}>
          {busy ? t('loading') : confirmLabel}
        </button>
        <button className="secondary" disabled={busy} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </>
  );
}
