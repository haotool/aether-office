import { useState } from 'react';
import {
  notificationsSupported,
  permissionNow,
  requestNotificationPermission,
} from '../notifications.js';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';

/** Alerts on or off. Turning them on is a user gesture, so it is also where the browser's permission is asked for. */
export function NotifyToggle() {
  const t = useT();
  const prefs = usePreferences();
  const [denied, setDenied] = useState(() => permissionNow() === 'denied');
  return (
    <>
      <label
        className="toggle-label"
        title={notificationsSupported() ? undefined : t('notifyUnsupported')}
      >
        <span>{t('notifyAlerts')}</span>
        <input
          type="checkbox"
          checked={prefs.notify}
          onChange={async (e) => {
            prefs.set({ notify: e.target.checked });
            if (!e.target.checked) return;
            setDenied(!(await requestNotificationPermission()) && permissionNow() !== 'default');
          }}
        />
      </label>
      <p className="muted">{t('notifyHint')}</p>
      {prefs.notify && denied && <p role="status">{t('notifyDenied')}</p>}
    </>
  );
}
