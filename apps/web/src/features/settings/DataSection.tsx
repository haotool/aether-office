import { useState } from 'react';
import { api } from '../../lib/api/api.js';
import { forgetCsrf } from '../../lib/api/api-csrf.js';
import { useT } from '../../ui/useT.js';
import { DangerZone, InlineHelp, Row } from './kit.js';

/** Where the browser keeps the preferences (state.ts). */
const PREFS_KEY = 'aether-ui-preferences';

const readPrefs = () => {
  try {
    return window.localStorage.getItem(PREFS_KEY) ?? '{}';
  } catch {
    return '{}';
  }
};

function exportPrefs() {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([readPrefs()], { type: 'application/json' }));
  link.download = 'aether-preferences.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Resetting asks twice: the first press only asks. */
function ResetPrefs() {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const reset = () => {
    try {
      window.localStorage.removeItem(PREFS_KEY);
    } catch {
      // storage blocked: there is nothing stored to clear
    }
    window.location.reload();
  };
  return asking ? (
    <div className="sconfirm" role="group" aria-label={t('stReset')}>
      <p>{t('stResetConfirm')}</p>
      <button type="button" className="secondary danger-button" onClick={reset}>
        {t('stReset')}
      </button>
      <button type="button" className="secondary" onClick={() => setAsking(false)}>
        {t('cancel')}
      </button>
    </div>
  ) : (
    <button type="button" className="secondary danger-button" onClick={() => setAsking(true)}>
      {t('stReset')}
    </button>
  );
}

async function signOut() {
  try {
    await api('/api/logout', { method: 'POST', body: '{}' });
  } finally {
    forgetCsrf();
    window.location.assign('/'); // a fresh start: nothing of this session stays in memory
  }
}

/** What is stored where, and the ways to take it with you or clear it. */
export function DataSection() {
  const t = useT();
  return (
    <>
      <Row id="storage">
        <InlineHelp summary={t('stStorageShow')}>
          <dl className="sfacts">
            <dt>{t('stStoreBrowser')}</dt>
            <dd>{t('stStoreBrowserBody')}</dd>
            <dt>{t('stStoreCookie')}</dt>
            <dd>{t('stStoreCookieBody')}</dd>
            <dt>{t('stStoreServer')}</dt>
            <dd>{t('stStoreServerBody')}</dd>
            <dt>{t('stStoreSessions')}</dt>
            <dd>{t('stStoreSessionsBody')}</dd>
          </dl>
        </InlineHelp>
      </Row>
      <Row
        id="prefs"
        control={
          <button type="button" className="secondary" onClick={exportPrefs}>
            {t('stExport')}
          </button>
        }
      >
        <DangerZone>
          <ResetPrefs />
        </DangerZone>
      </Row>
      <Row
        id="signout"
        control={
          <button type="button" className="secondary" onClick={() => void signOut()}>
            {t('logout')}
          </button>
        }
      />
    </>
  );
}
