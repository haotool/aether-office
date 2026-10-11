import { X } from 'lucide-react';
import { useInstallHint } from '../../lib/platform/install-prompt.js';
import { applyUpdate, useUpdateReady } from '../../lib/platform/pwa.js';
import { useT } from '../../ui/useT.js';

export function PwaNotices() {
  const t = useT();
  const update = useUpdateReady();
  const { hint, install, dismiss } = useInstallHint();
  return (
    <>
      {update && (
        <div className="notice" role="status">
          {t('updateReady')}
          <button onClick={applyUpdate}>{t('updateReload')}</button>
        </div>
      )}
      {hint && (
        <div className="notice" role="status">
          {hint === 'prompt' ? t('installOffer') : t('installIos')}
          <span>
            {hint === 'prompt' && <button onClick={install}>{t('installAction')}</button>}
            <button aria-label={t('close')} onClick={dismiss}>
              <X size={15} />
            </button>
          </span>
        </div>
      )}
    </>
  );
}
