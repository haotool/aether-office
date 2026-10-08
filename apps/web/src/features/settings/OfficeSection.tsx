import { usePreferences } from '../../state.js';
import { useT } from '../../ui/useT.js';
import { Row, Segmented, StatusChip, Switch } from './kit.js';
import { OfficeAnimationsSettings } from './OfficeAnimationsSettings.js';

/** How the office opens and what is drawn round it. */
export function OfficeSection() {
  const t = useT();
  const prefs = usePreferences();
  return (
    <>
      <Row
        id="view"
        control={
          <Segmented
            value={prefs.view}
            options={[
              { value: '3d', label: t('view3d') },
              { value: '2d', label: t('view2d') },
            ]}
            onChange={(view) => prefs.set({ view })}
          />
        }
      />
      <Row
        id="camera"
        control={
          <Switch checked={prefs.autoCamera} onChange={(autoCamera) => prefs.set({ autoCamera })} />
        }
        status={
          navigator.webdriver && <StatusChip tone="info">{t('stCameraAutomation')}</StatusChip>
        }
      />
      <Row
        id="beanstalk"
        control={
          <Switch checked={prefs.beanstalk} onChange={(beanstalk) => prefs.set({ beanstalk })} />
        }
      />
      <OfficeAnimationsSettings />
    </>
  );
}
