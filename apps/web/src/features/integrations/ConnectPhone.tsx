import { lazy, Suspense, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Modal } from '../../ui/Modal.js';
import { useT } from '../../ui/useT.js';

const PairPanel = lazy(() => import('./PairPanel.js').then((m) => ({ default: m.PairPanel })));

export function PairPhoneButton({ variant }: { variant: 'icon' | 'text' }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'icon' ? (
        <button
          className="icon-button"
          aria-label={t('pairOpen')}
          title={t('pairOpen')}
          onClick={() => setOpen(true)}
        >
          <Smartphone size={18} />
        </button>
      ) : (
        <button className="secondary" onClick={() => setOpen(true)}>
          <Smartphone size={18} aria-hidden="true" />
          {t('pairOpen')}
        </button>
      )}
      {open && (
        <Modal title={t('pairTitle')} onClose={() => setOpen(false)}>
          <Suspense fallback={null}>
            <PairPanel />
          </Suspense>
        </Modal>
      )}
    </>
  );
}
