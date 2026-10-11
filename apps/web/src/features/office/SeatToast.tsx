import { X } from 'lucide-react';
import { useT } from '../../ui/useT.js';
import type { SeatToast as Toast } from './seat-move.js';

export function SeatToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const t = useT();
  return (
    <div className="undo-toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button type="button" className="secondary" onClick={toast.undo}>
          {t('undo')}
        </button>
      )}
      <button type="button" className="icon-button" aria-label={t('close')} onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}
