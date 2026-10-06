import type { Mode } from '@aether/contracts';
import { usePreferences } from '../state.js';
import { useT, PageHeading, Field } from '../ui.js';
import { NotifyToggle } from './NotifyToggle.js';
import { A2AClients } from './A2AClients.js';
import { DetectedModels } from './DetectedModels.js';
import { ExecutionSettings } from './ExecutionSettings.js';
import { Integrations } from './Integrations.js';
import { RemoteApprovals } from './RemoteApprovals.js';
import { Schedules } from './Schedules.js';

/** Personal preferences, then what a project can be connected to; schedules, A2A and integrations only with Advanced on. */
export function SettingsPage({
  projectId,
  mode,
  owner,
  canWrite,
}: {
  projectId: string;
  mode: Mode;
  owner: boolean;
  canWrite: boolean;
}) {
  const t = useT();
  const prefs = usePreferences();
  return (
    <>
      <PageHeading title={t('settings')} />
      <div className="settings-panel panel">
        <Field label={t('language')}>
          <select
            value={prefs.locale}
            onChange={(e) => prefs.set({ locale: e.target.value as typeof prefs.locale })}
          >
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('appearance')}>
          <select
            value={prefs.theme}
            onChange={(e) => prefs.set({ theme: e.target.value as typeof prefs.theme })}
          >
            <option value="dark">{t('dark')}</option>
            <option value="light">{t('light')}</option>
          </select>
        </Field>
        <label className="toggle-label">
          <span>{t('motion')}</span>
          <input
            type="checkbox"
            checked={prefs.reducedMotion}
            onChange={(e) => prefs.set({ reducedMotion: e.target.checked })}
          />
        </label>
        <label className="toggle-label">
          <span>{t('advancedTitle')}</span>
          <input
            type="checkbox"
            checked={prefs.advanced}
            onChange={(e) => prefs.set({ advanced: e.target.checked })}
          />
        </label>
        <p className="muted">{t('advancedHint')}</p>
        <NotifyToggle />
        <p className="muted">{mode === 'demo' ? t('demoNote') : t('runnerGrantRequired')}</p>
      </div>
      {prefs.advanced && (
        <>
          <Schedules projectId={projectId} canManage={canWrite} />
          <A2AClients projectId={projectId} canManage={owner} />
          <Integrations projectId={projectId} canManage={owner} />
        </>
      )}
      {mode === 'live' && (
        <>
          <RemoteApprovals canManage={owner} />
          <ExecutionSettings projectId={projectId} canConfigure={owner} />
          <DetectedModels />
        </>
      )}
    </>
  );
}
